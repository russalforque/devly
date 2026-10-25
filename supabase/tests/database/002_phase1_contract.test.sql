begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
grant usage on schema extensions to authenticated;
select no_plan();

select results_eq('select id from public.lessons order by id',
  array['api-errors', 'git-recovery', 'js-async', 'react-effects', 'sql-joins', 'ts-narrowing']::text[],
  'Exactly the six active lesson IDs are seeded');
select results_eq('select id from public.learning_tracks order by id',
  array['git', 'javascript', 'node', 'react', 'sql', 'typescript']::text[],
  'Track IDs match the client contract exactly');
select results_eq(
  'select l.id || '':'' || m.track_id from public.lessons l join public.modules m on m.id = l.module_id order by l.id',
  array['api-errors:node', 'git-recovery:git', 'js-async:javascript', 'react-effects:react', 'sql-joins:sql', 'ts-narrowing:typescript']::text[],
  'Lessons belong to the expected tracks');
select is((select count(*) from public.lessons where length(content_md) > 500 and xp_reward = 50), 6::bigint,
          'Every active lesson has substantive content and a 50 XP reward');
select results_eq(
  'select id, title, estimated_minutes, difficulty from public.lessons order by id',
  $$values
    ('api-errors'::text, 'Treat API failures as a contract'::text, 10, 'intermediate'::text),
    ('git-recovery', 'Undo safely. Keep the history.', 10, 'intermediate'),
    ('js-async', 'Bring order to async work', 14, 'intermediate'),
    ('react-effects', 'Effects without the side effects', 15, 'intermediate'),
    ('sql-joins', 'The missing rows mystery', 12, 'intermediate'),
    ('ts-narrowing', 'Make impossible states impossible', 12, 'intermediate')$$,
  'Seed metadata matches canonical content.ts (difficulty normalized to lowercase)');
select col_type_is('public', 'learning_events', 'minutes', 'integer', 'Minutes use the integer client contract');
select col_type_is('public', 'learning_events', 'id', 'uuid', 'Event IDs are UUIDs');
select col_type_is('public', 'learning_events', 'lesson_id', 'text', 'Event lesson IDs are text');
select col_is_null('public', 'learning_events', 'lesson_id', 'Practice may have no lesson');

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'devly-owner-test@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'devly-other-test@example.invalid');
delete from private.owner;
insert into private.owner(user_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.profiles(id) values
  ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.interview_sessions(id, user_id, track_id) values
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'react');

-- Inject a test-only event error AFTER the RPC's progress upsert to verify atomicity.
create function pg_temp.reject_test_event() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid then
    raise exception 'Test-only event failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger reject_test_event before insert on public.learning_events
  for each row execute function pg_temp.reject_test_event();

set local role authenticated;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$insert into public.lesson_progress(user_id, lesson_id) values (auth.uid(), 'react-effects')$$,
                'Progress can start with defaults');
select is((select status from public.lesson_progress where lesson_id = 'react-effects'), 'started', 'Default status is started');
select is((select answers from public.lesson_progress where lesson_id = 'react-effects'), '[]'::jsonb, 'Default answers are a number array');
select lives_ok($$select public.complete_lesson('react-effects', '[1,0,2]', 12, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
                'Owner completes an existing started lesson');
select is((select status from public.lesson_progress where lesson_id = 'react-effects'), 'completed', 'RPC upserts completed status');
select is((select answers from public.lesson_progress where lesson_id = 'react-effects'), '[1,0,2]'::jsonb, 'RPC preserves answer order');
select is((select xp from public.learning_events where lesson_id = 'react-effects'), 50, 'RPC awards exactly 50 XP');
select is((select minutes from public.learning_events where lesson_id = 'react-effects'), 12, 'RPC stores integer minutes');
select is((select user_id from public.learning_events where lesson_id = 'react-effects'), auth.uid(), 'RPC derives user ID from authentication');

select lives_ok($$select public.complete_lesson('react-effects', '[1,2]', 99, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
                'Retrying the same event UUID is safe');
select lives_ok($$select public.complete_lesson('react-effects', '[1]', 99, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
                'Completing again with a new UUID is safe');
select is((select count(*) from public.learning_events where lesson_id = 'react-effects' and kind = 'lesson_completed'), 1::bigint,
          'Only one completion event exists per user and lesson');
select is((select sum(xp) from public.learning_events), 50::bigint, 'Repeated completion never duplicates XP');
select is((select minutes from public.learning_events where lesson_id = 'react-effects'), 12, 'Retry preserves original event minutes');
select is((select answers from public.lesson_progress where lesson_id = 'react-effects'), '[1]'::jsonb, 'Retry may refresh progress answers');
select throws_ok($$insert into public.learning_events(user_id, lesson_id, kind, xp, minutes) values (auth.uid(), 'react-effects', 'lesson_completed', 50, 10)$$,
                 '23505', null, 'Partial unique index rejects a direct duplicate completion');

select lives_ok($$select public.complete_lesson('ts-narrowing', '[0]', 0, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,
                'RPC creates progress when there was no started row');
select is((select count(*) from public.lesson_progress where lesson_id = 'ts-narrowing' and status = 'completed'), 1::bigint,
          'New completion is persisted');

select lives_ok($$insert into public.learning_events(user_id, lesson_id, kind, xp, minutes) values (auth.uid(), 'react-effects', 'check_failed', 0, 1)$$,
                'Failed checks record zero XP');
select lives_ok($$insert into public.learning_events(user_id, lesson_id, kind, xp, minutes) values (auth.uid(), 'react-effects', 'practice', 0, 3), (auth.uid(), 'react-effects', 'practice', 0, 3)$$,
                'Repeated practice events are allowed');
select lives_ok($$insert into public.learning_events(user_id, lesson_id, kind, xp, minutes) values (auth.uid(), null, 'practice', 0, 5)$$,
                'General practice may omit a lesson');
select is((select count(*) from public.learning_events where lesson_id = 'react-effects' and kind = 'practice'), 2::bigint,
          'Completion uniqueness does not deduplicate practice');
select throws_ok($$insert into public.learning_events(user_id, kind, xp) values (auth.uid(), 'check_failed', 50)$$,
                 '23514', null, 'Failed checks cannot award XP');
select throws_ok($$insert into public.learning_events(user_id, kind, xp) values (auth.uid(), 'practice', 50)$$,
                 '23514', null, 'Practice cannot award XP');
select throws_ok($$insert into public.learning_events(user_id, lesson_id, kind, xp) values (auth.uid(), 'sql-joins', 'lesson_completed', 100)$$,
                 '23514', null, 'Completion reward is fixed at 50 XP');
select throws_ok($$insert into public.learning_events(user_id, kind, minutes) values (auth.uid(), 'practice', -1)$$,
                 '23514', null, 'Negative minutes are rejected');
select throws_ok($$insert into public.learning_events(user_id, kind) values (auth.uid(), 'other')$$,
                 '23514', null, 'Unknown event kinds are rejected');

select throws_ok($$select public.complete_lesson('js-async', '[2]', -1, gen_random_uuid())$$,
                 '22023', null, 'RPC rejects negative minutes');
select throws_ok($$select public.complete_lesson('js-async', '[2]', 1441, gen_random_uuid())$$,
                 '22023', null, 'RPC rejects minutes above the event limit');
select throws_ok($$select public.complete_lesson('js-async', '[2]', null, gen_random_uuid())$$,
                 '22023', null, 'RPC requires minutes');
select throws_ok($$select public.complete_lesson('js-async', '[2]', 10, null)$$,
                 '22023', null, 'RPC requires an event UUID');
select throws_ok($$select public.complete_lesson(null, '[2]', 10, gen_random_uuid())$$,
                 '22023', null, 'RPC requires a lesson ID');
select throws_ok($$select public.complete_lesson('js-async', null, 10, gen_random_uuid())$$,
                 '22023', null, 'RPC requires answers');
select throws_ok($$select public.complete_lesson('js-async', '{}', 10, gen_random_uuid())$$,
                 '23514', null, 'Answers cannot be a JSON object');
select throws_ok($$select public.complete_lesson('js-async', '["2"]', 10, gen_random_uuid())$$,
                 '23514', null, 'Answers cannot contain strings');
select throws_ok($$select public.complete_lesson('js-async', '[null]', 10, gen_random_uuid())$$,
                 '23514', null, 'Answers cannot contain JSON null');
select throws_ok($$select public.complete_lesson('missing-lesson', '[2]', 10, gen_random_uuid())$$,
                 '23503', null, 'Unknown lesson IDs are rejected by the catalog FK');
select is((select count(*) from public.lesson_progress where lesson_id = 'js-async'), 0::bigint,
          'Invalid RPC inputs create no progress');

insert into public.lesson_progress(user_id, lesson_id, status, answers, updated_at)
values (auth.uid(), 'sql-joins', 'started', '[0]', '2000-01-01T00:00:00Z');
select throws_ok($$select public.complete_lesson('sql-joins', '[1]', 12, 'ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
                 'P0001', 'Test-only event failure', 'Event failure aborts the completion transaction');
select is((select status from public.lesson_progress where lesson_id = 'sql-joins'), 'started', 'Failed event rolls back progress status');
select is((select answers from public.lesson_progress where lesson_id = 'sql-joins'), '[0]'::jsonb, 'Failed event rolls back answers');
select is((select updated_at from public.lesson_progress where lesson_id = 'sql-joins'), '2000-01-01T00:00:00Z'::timestamptz,
          'Failed event rolls back progress timestamp');
select is((select count(*) from public.learning_events where lesson_id = 'sql-joins'), 0::bigint, 'Failed event leaves no completion reward');
select lives_ok($$update public.lesson_progress set answers = '[1]', updated_at = '1999-01-01T00:00:00Z' where lesson_id = 'sql-joins'$$,
                'Owner can save started answers');
select is((select updated_at from public.lesson_progress where lesson_id = 'sql-joins'), now(), 'Update trigger owns updated_at');
select throws_ok($$update public.lesson_progress set status = 'in_progress' where lesson_id = 'sql-joins'$$,
                 '23514', null, 'Only started and completed progress statuses are accepted');

select lives_ok($$insert into public.bookmarks(user_id, lesson_id) values (auth.uid(), 'react-effects') on conflict (user_id, lesson_id) do update set lesson_id = excluded.lesson_id$$,
                'Composite bookmark upsert inserts');
select lives_ok($$insert into public.bookmarks(user_id, lesson_id) values (auth.uid(), 'react-effects') on conflict (user_id, lesson_id) do update set lesson_id = excluded.lesson_id$$,
                'Composite bookmark upsert retries');
select is((select count(*) from public.bookmarks where lesson_id = 'react-effects'), 1::bigint, 'Bookmark upsert does not duplicate');
select lives_ok($$delete from public.bookmarks where user_id = auth.uid() and lesson_id = 'react-effects'$$, 'Owner can remove a bookmark');
select is((select count(*) from public.bookmarks where lesson_id = 'react-effects'), 0::bigint, 'Bookmark deletion persists');
select throws_ok($$update public.profiles set daily_goal_minutes = 0 where id = auth.uid()$$,
                 '23514', null, 'Daily goal must be positive');
select throws_ok($$insert into public.interview_answers(user_id, session_id, question_text, position) values (auth.uid(), '44444444-4444-4444-8444-444444444444', 'Spoofed session', 1)$$,
                 '23503', null, 'Composite FK prevents attaching own answer to a foreign session');

reset role;
select * from finish();
rollback;
