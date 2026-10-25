begin;

-- Keep the original migration applicable to existing installations. Invalid old
-- profile values must be reviewed before applying these narrower UI constraints.
alter table public.profiles
  drop constraint profiles_display_name_check,
  drop constraint profiles_daily_goal_minutes_check,
  add constraint profiles_display_name_check check (
    display_name = btrim(display_name) and length(display_name) between 1 and 40
  ),
  add constraint profiles_daily_goal_minutes_check check (daily_goal_minutes in (10, 20, 30, 45, 60));

alter table public.lessons
  add column difficulty text not null default 'intermediate'
  check (difficulty in ('beginner', 'intermediate', 'advanced'));
comment on column public.lessons.difficulty is
  'Lowercase metadata mirror of the canonical static curriculum in src/features/curriculum/content.ts.';

-- Snapshot the submitted answers so reusing a UUID with a different payload can
-- be rejected even after another attempt changes lesson_progress.answers.
-- NULL is reserved for legacy/direct events that did not capture this snapshot.
alter table public.learning_events
  add column check_answers jsonb check (
    check_answers is null or (
      jsonb_typeof(check_answers) = 'array'
      and not jsonb_path_exists(check_answers, '$[*] ? (@.type() != "number")')
    )
  );

-- A failed existing check records answers without moving the success/review
-- timestamp. The RPC scopes this flag to its upsert and restores the old value.
-- Other direct updates and the legacy completion RPC retain normal timestamps.
create function private.touch_lesson_progress_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('devly.preserve_progress_timestamp', true) = 'on' then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.touch_lesson_progress_updated_at() from public, anon, authenticated;
drop trigger touch_updated_at on public.lesson_progress;
create trigger touch_updated_at before update on public.lesson_progress
  for each row execute function private.touch_lesson_progress_updated_at();

create function public.record_lesson_check(
  p_lesson_id text,
  p_answers jsonb,
  p_minutes integer,
  p_event_id uuid,
  p_passed boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.learning_events%rowtype;
  v_inserted_id uuid;
  v_timestamp_setting text;
begin
  if not public.is_owner() then
    raise exception 'Only the configured owner can record lesson checks' using errcode = '42501';
  end if;
  if p_lesson_id is null or p_answers is null or p_minutes is null
     or p_event_id is null or p_passed is null or p_minutes < 0 or p_minutes > 1440 then
    raise exception 'Lesson, answers, minutes (0..1440), event UUID, and passed flag are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_answers) <> 'array'
     or jsonb_path_exists(p_answers, '$[*] ? (@.type() != "number")') then
    raise exception 'Answers must be a JSON number array' using errcode = '23514';
  end if;

  -- Serialize this owner's check RPCs, including retries of the same UUID, before
  -- checking event existence. The unique index remains the final XP safeguard,
  -- including races with the legacy RPC/direct table writes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('devly:lesson-check:' || v_user_id::text, 0)
  );
  select * into v_existing from public.learning_events
  where id = p_event_id and user_id = v_user_id;
  if found then
    if v_existing.lesson_id is distinct from p_lesson_id
       or v_existing.minutes is distinct from p_minutes
       or (v_existing.kind <> 'check_failed') is distinct from p_passed
       or (v_existing.check_answers is not null and v_existing.check_answers is distinct from p_answers) then
      raise exception 'Event UUID already belongs to a different check payload' using errcode = '22023';
    end if;
    return; -- No progress or timestamp mutation on a retry, even after later checks.
  end if;

  v_timestamp_setting := pg_catalog.current_setting('devly.preserve_progress_timestamp', true);
  perform pg_catalog.set_config('devly.preserve_progress_timestamp', case when p_passed then 'off' else 'on' end, true);
  insert into public.lesson_progress as existing (user_id, lesson_id, status, answers)
  values (v_user_id, p_lesson_id, case when p_passed then 'completed' else 'started' end, p_answers)
  on conflict (user_id, lesson_id) do update set
    status = case when p_passed or existing.status = 'completed' then 'completed' else 'started' end,
    answers = excluded.answers,
    updated_at = case when p_passed then now() else existing.updated_at end;
  perform pg_catalog.set_config('devly.preserve_progress_timestamp', coalesce(v_timestamp_setting, ''), true);

  if not p_passed then
    insert into public.learning_events (id, user_id, lesson_id, kind, xp, minutes, check_answers)
    values (p_event_id, v_user_id, p_lesson_id, 'check_failed', 0, p_minutes, p_answers);
  elsif exists (
    select 1 from public.learning_events
    where user_id = v_user_id and lesson_id = p_lesson_id and kind = 'lesson_completed'
  ) then
    insert into public.learning_events (id, user_id, lesson_id, kind, xp, minutes, check_answers)
    values (p_event_id, v_user_id, p_lesson_id, 'practice', 0, p_minutes, p_answers);
  else
    insert into public.learning_events (id, user_id, lesson_id, kind, xp, minutes, check_answers)
    values (p_event_id, v_user_id, p_lesson_id, 'lesson_completed', 50, p_minutes, p_answers)
    on conflict (user_id, lesson_id) where kind = 'lesson_completed' do nothing
    returning id into v_inserted_id;

    -- Another writer may have claimed the completion between the existence check
    -- and INSERT. Preserve this distinct successful attempt as zero-XP practice.
    if v_inserted_id is null then
      insert into public.learning_events (id, user_id, lesson_id, kind, xp, minutes, check_answers)
      values (p_event_id, v_user_id, p_lesson_id, 'practice', 0, p_minutes, p_answers);
    end if;
  end if;
end;
$$;
revoke all on function public.record_lesson_check(text, jsonb, integer, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_lesson_check(text, jsonb, integer, uuid, boolean) to authenticated;
comment on function public.record_lesson_check(text, jsonb, integer, uuid, boolean) is
  'Atomic owner-only check recording; exact retries are no-ops, first pass earns 50 XP, later passes are zero-XP practice.';

-- public.complete_lesson(text,jsonb,integer,uuid) remains unchanged for legacy clients.
commit;
