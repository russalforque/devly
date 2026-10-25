begin;

-- The API exposes public only. Never expose private through PostgREST.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

-- Future objects created by this migration role must be explicitly granted.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create table private.owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table private.owner enable row level security;
revoke all on private.owner from public, anon, authenticated;
comment on table private.owner is
  'Zero or one authorized Auth user. Empty means deny all. Managed only by trusted SQL administration.';

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.owner as o
    where o.singleton and o.user_id = (select auth.uid())
  );
$$;
alter function public.is_owner() owner to postgres;
revoke all on function public.is_owner() from public, anon, authenticated;
grant execute on function public.is_owner() to authenticated;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Learner' check (length(btrim(display_name)) between 1 and 100),
  daily_goal_minutes integer not null default 20 check (daily_goal_minutes between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.technologies (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.learning_tracks (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  technology_id text not null references public.technologies(id) on delete restrict,
  title text not null,
  description text not null,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  position integer not null unique check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_tracks_technology_idx on public.learning_tracks(technology_id);

create table public.modules (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  track_id text not null references public.learning_tracks(id) on delete cascade,
  title text not null,
  description text not null,
  position integer not null check (position > 0),
  unique (track_id, position)
);

create table public.lessons (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  module_id text not null references public.modules(id) on delete cascade,
  title text not null,
  summary text not null,
  content_md text not null,
  estimated_minutes integer not null check (estimated_minutes between 1 and 1440),
  xp_reward integer not null default 50 check (xp_reward >= 0),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, position)
);

create table public.challenges (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  lesson_id text not null references public.lessons(id) on delete cascade,
  title text not null,
  prompt_md text not null,
  kind text not null check (kind in ('multiple_choice', 'short_answer', 'code')),
  starter_code text,
  solution_explanation text not null,
  position integer not null check (position > 0),
  unique (lesson_id, position)
);

create table public.challenge_test_cases (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  challenge_id text not null references public.challenges(id) on delete cascade,
  label text not null,
  input jsonb not null default '{}'::jsonb,
  expected_output jsonb not null,
  position integer not null check (position > 0),
  unique (challenge_id, position)
);
comment on table public.challenge_test_cases is
  'Versioned answer fixtures, visible to the owner. Not hidden grader tests or executable SQL/code.';

create table public.challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id text not null references public.challenges(id) on delete restrict,
  answer jsonb not null default '{}'::jsonb,
  outcome text not null check (outcome in ('submitted', 'passed', 'failed')),
  feedback text,
  duration_seconds integer check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);
create index challenge_attempts_user_created_idx on public.challenge_attempts(user_id, created_at desc);
create index challenge_attempts_challenge_idx on public.challenge_attempts(challenge_id);

create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null references public.lessons(id) on delete cascade,
  status text not null default 'started' check (status in ('started', 'completed')),
  answers jsonb not null default '[]'::jsonb check (
    jsonb_typeof(answers) = 'array'
    and not jsonb_path_exists(answers, '$[*] ? (@.type() != "number")')
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_idx on public.lesson_progress(lesson_id);

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text references public.lessons(id) on delete set null,
  kind text not null check (kind in ('lesson_completed', 'check_failed', 'practice')),
  xp integer not null default 0 check (xp >= 0),
  minutes integer not null default 0 check (minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  constraint learning_events_xp_by_kind check (
    (kind = 'lesson_completed' and xp = 50)
    or (kind in ('check_failed', 'practice') and xp = 0)
  )
);
create index learning_events_user_created_idx on public.learning_events(user_id, created_at desc);
create index learning_events_lesson_idx on public.learning_events(lesson_id);
create unique index learning_events_one_completion_per_lesson
  on public.learning_events(user_id, lesson_id)
  where kind = 'lesson_completed';

create table public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null references public.lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index bookmarks_lesson_idx on public.bookmarks(lesson_id);

create table public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  technology_id text not null references public.technologies(id) on delete restrict,
  score numeric(5,2) not null check (score between 0 and 100),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  assessed_at timestamptz not null default now()
);
create index skill_assessments_user_technology_idx on public.skill_assessments(user_id, technology_id, assessed_at desc);
create index skill_assessments_technology_idx on public.skill_assessments(technology_id);

create table public.skill_mastery (
  user_id uuid not null references public.profiles(id) on delete cascade,
  technology_id text not null references public.technologies(id) on delete cascade,
  mastery_score numeric(5,2) not null default 0 check (mastery_score between 0 and 100),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, technology_id)
);
create index skill_mastery_technology_idx on public.skill_mastery(technology_id);

create table public.daily_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  minutes integer not null default 0 check (minutes >= 0),
  xp integer not null default 0 check (xp >= 0),
  lessons_completed integer not null default 0 check (lessons_completed >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);
comment on table public.daily_activity is
  'Reserved aggregate cache; Phase 1 reads learning_events directly. No automatic aggregation is installed.';

create table public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id text references public.learning_tracks(id) on delete restrict,
  title text not null,
  target_minutes integer not null check (target_minutes > 0),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_goals_user_status_idx on public.learning_goals(user_id, status);
create index learning_goals_track_idx on public.learning_goals(track_id);

create table public.achievements (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text not null,
  metric text not null check (metric in ('lessons_completed', 'practice_minutes', 'streak_days')),
  threshold integer not null check (threshold > 0)
);

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create index user_achievements_achievement_idx on public.user_achievements(achievement_id);

create table public.review_schedules (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null references public.lessons(id) on delete cascade,
  due_at timestamptz not null,
  interval_days integer not null default 1 check (interval_days > 0),
  ease_factor numeric(4,2) not null default 2.50 check (ease_factor >= 1.30),
  repetitions integer not null default 0 check (repetitions >= 0),
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index review_schedules_user_due_idx on public.review_schedules(user_id, due_at);
create index review_schedules_lesson_idx on public.review_schedules(lesson_id);

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null references public.learning_tracks(id) on delete restrict,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  check ((status = 'completed') = (completed_at is not null)),
  check (completed_at is null or completed_at >= started_at)
);
create index interview_sessions_user_started_idx on public.interview_sessions(user_id, started_at desc);
create index interview_sessions_track_idx on public.interview_sessions(track_id);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  challenge_id text references public.challenges(id) on delete restrict,
  question_text text not null,
  answer_text text not null default '',
  feedback text,
  score numeric(5,2) check (score between 0 and 100),
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.interview_sessions(id, user_id) on delete cascade,
  unique (session_id, position)
);
create index interview_answers_user_idx on public.interview_answers(user_id);
create index interview_answers_challenge_idx on public.interview_answers(challenge_id);

-- Explicit inventory prevents unintentionally granting access to unrelated objects.
do $$
declare
  table_name text;
  ownership_expression text;
begin
  foreach table_name in array array[
    'profiles', 'technologies', 'learning_tracks', 'modules', 'lessons',
    'challenges', 'challenge_test_cases', 'challenge_attempts', 'lesson_progress',
    'learning_events', 'bookmarks', 'skill_assessments', 'skill_mastery',
    'daily_activity', 'learning_goals', 'achievements', 'user_achievements',
    'review_schedules', 'interview_sessions', 'interview_answers'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);

    if table_name = 'profiles' then
      ownership_expression := 'id = (select auth.uid()) and (select public.is_owner())';
    elsif table_name = any (array[
      'technologies', 'learning_tracks', 'modules', 'lessons', 'challenges',
      'challenge_test_cases', 'achievements'
    ]) then
      ownership_expression := '(select public.is_owner())';
    else
      ownership_expression := 'user_id = (select auth.uid()) and (select public.is_owner())';
    end if;

    execute format(
      'create policy owner_access on public.%I for all to authenticated using (%s) with check (%s)',
      table_name, ownership_expression, ownership_expression
    );
  end loop;

  foreach table_name in array array[
    'profiles', 'learning_tracks', 'lessons', 'lesson_progress', 'skill_mastery',
    'daily_activity', 'learning_goals', 'review_schedules'
  ] loop
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      table_name
    );
  end loop;
end;
$$;

-- Invoker rights retain the same table grants and RLS as direct client writes.
-- A function call is one transaction: event errors roll back progress changes.
create function public.complete_lesson(
  p_lesson_id text,
  p_answers jsonb,
  p_minutes integer,
  p_event_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the configured owner can complete lessons' using errcode = '42501';
  end if;

  if p_lesson_id is null or p_event_id is null or p_answers is null
     or p_minutes is null or p_minutes < 0 or p_minutes > 1440 then
    raise exception 'Lesson, answers, event UUID, and minutes (0..1440) are required' using errcode = '22023';
  end if;

  insert into public.lesson_progress (user_id, lesson_id, status, answers)
  values (auth.uid(), p_lesson_id, 'completed', p_answers)
  on conflict (user_id, lesson_id) do update
    set status = excluded.status, answers = excluded.answers, updated_at = now();

  insert into public.learning_events (id, user_id, lesson_id, kind, xp, minutes)
  values (p_event_id, auth.uid(), p_lesson_id, 'lesson_completed', 50, p_minutes)
  on conflict do nothing;
end;
$$;
revoke all on function public.complete_lesson(text, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.complete_lesson(text, jsonb, integer, uuid) to authenticated;

commit;
