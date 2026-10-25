-- Atomic checks, payload-aware retry dedupe, failed-check timestamps, and UI constraints.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
grant usage on schema extensions to anon, authenticated;
select no_plan();

select ok(not p.prosecdef and p.proconfig @> array['search_path=""'],
          'record_lesson_check has invoker rights and fixed empty search_path')
from pg_proc p where p.oid = 'public.record_lesson_check(text,jsonb,integer,uuid,boolean)'::regprocedure;
select ok(not has_function_privilege('anon', 'public.record_lesson_check(text,jsonb,integer,uuid,boolean)', 'EXECUTE'),
          'Anonymous has no check RPC execution grant');
select ok(has_function_privilege('authenticated', 'public.record_lesson_check(text,jsonb,integer,uuid,boolean)', 'EXECUTE'),
          'Authenticated can call the owner-checked RPC');

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'devly-owner-test@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'devly-other-test@example.invalid');
delete from private.owner;
insert into public.profiles(id) values ('11111111-1111-4111-8111-111111111111');

set local role authenticated;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, gen_random_uuid(), true)$$,
                 '42501', null, 'Empty owner configuration denies check RPC');
reset role;
insert into private.owner(user_id) values ('11111111-1111-4111-8111-111111111111');
set local role anon;
select throws_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, gen_random_uuid(), true)$$,
                 '42501', null, 'Anonymous check RPC denied even with owner sub');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, gen_random_uuid(), true)$$,
                 '42501', null, 'Nonowner check RPC denied');
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, gen_random_uuid(), true)$$,
                 '42501', null, 'Missing subject denies check RPC');
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$select public.record_lesson_check('react-effects', '[0,0]', 2, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false)$$,
                'First failed check creates progress and event together');
select is((select status from public.lesson_progress where lesson_id = 'react-effects'), 'started', 'Failed first check starts progress');
select is((select kind from public.learning_events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 'check_failed', 'Failed check event is explicit');
select is((select check_answers from public.learning_events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), '[0,0]'::jsonb,
          'Event retains submitted answer snapshot');
select lives_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true)$$,
                'First passed check records completion');
select is((select status from public.lesson_progress where lesson_id = 'react-effects'), 'completed', 'Pass completes progress');
select is((select xp from public.learning_events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'), 50, 'First pass earns 50 XP');
select lives_ok($$select public.record_lesson_check('react-effects', '[1,2]', 3, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true)$$,
                'Distinct repeat pass records practice');
select is((select kind from public.learning_events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'), 'practice', 'Repeat pass is practice');
select is((select xp from public.learning_events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'), 0, 'Practice earns zero XP');

select lives_ok($$select public.record_lesson_check('react-effects', '[1,2]', 3, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', true)$$,
                'Exact practice retry is a no-op');
select lives_ok($$select public.record_lesson_check('react-effects', '[0,0]', 2, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false)$$,
                'Retrying an older failed check is also a no-op');
select lives_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true)$$,
                'Completion retry does not turn into an extra practice event');
select is((select answers from public.lesson_progress where lesson_id = 'react-effects'), '[1,2]'::jsonb,
          'Retry of old failure does not overwrite newer progress');
select is((select count(*) from public.learning_events where lesson_id = 'react-effects'), 3::bigint, 'Retries add no events');
select is((select sum(minutes) from public.learning_events where lesson_id = 'react-effects'), 20::bigint, 'Retries do not duplicate minutes');
select is((select sum(xp) from public.learning_events where lesson_id = 'react-effects'), 50::bigint, 'All checks together earn only one completion reward');

select throws_ok($$select public.record_lesson_check('ts-narrowing', '[1,2]', 15, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true)$$,
                 '22023', null, 'Reusing UUID for a different lesson is rejected');
select throws_ok($$select public.record_lesson_check('react-effects', '[0,2]', 15, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true)$$,
                 '22023', null, 'Reusing UUID with different answers is rejected');
select throws_ok($$select public.record_lesson_check('react-effects', '[1,2]', 14, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true)$$,
                 '22023', null, 'Reusing UUID with different minutes is rejected');
select throws_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', false)$$,
                 '22023', null, 'Reusing UUID with different outcome is rejected');
select is((select count(*) from public.lesson_progress where lesson_id = 'ts-narrowing'), 0::bigint, 'Conflicting UUID has no progress side effect');

-- Old timestamps distinguish a real preserved timestamp from now() inside this
-- single transaction. Include both started and previously completed progress.
insert into public.lesson_progress(user_id, lesson_id, status, answers, updated_at) values
  (auth.uid(), 'sql-joins', 'started', '[0,1]', '2000-01-01T00:00:00Z'),
  (auth.uid(), 'git-recovery', 'completed', '[1,0]', '2000-01-01T00:00:00Z');
insert into public.learning_events(user_id, lesson_id, kind, xp, minutes, created_at)
values (auth.uid(), 'git-recovery', 'lesson_completed', 50, 10, '2000-01-01T00:00:00Z');
select lives_ok($$select public.record_lesson_check('sql-joins', '[0,0]', 1, gen_random_uuid(), false)$$,
                'Failed existing started check can update answers');
select is((select updated_at from public.lesson_progress where lesson_id = 'sql-joins'), '2000-01-01T00:00:00Z'::timestamptz,
          'Failed existing started check preserves updated_at');
select lives_ok($$select public.record_lesson_check('git-recovery', '[0,0]', 1, gen_random_uuid(), false)$$,
                'Failed review can be recorded');
select is((select status from public.lesson_progress where lesson_id = 'git-recovery'), 'completed', 'Failed review never undoes completion');
select is((select answers from public.lesson_progress where lesson_id = 'git-recovery'), '[0,0]'::jsonb, 'Failed review saves latest answers');
select is((select updated_at from public.lesson_progress where lesson_id = 'git-recovery'), '2000-01-01T00:00:00Z'::timestamptz,
          'Failed review does not postpone the old progress review timestamp');
select is((select max(created_at) from public.learning_events where lesson_id = 'git-recovery' and kind in ('lesson_completed', 'practice')),
          '2000-01-01T00:00:00Z'::timestamptz, 'Failed review leaves last successful event unchanged');
select isnt(coalesce(current_setting('devly.preserve_progress_timestamp', true), ''), 'on', 'RPC restores its timestamp flag');
select lives_ok($$select public.record_lesson_check('sql-joins', '[2,0]', 12, gen_random_uuid(), true)$$,
                'Successful check after failure completes normally');
select is((select updated_at from public.lesson_progress where lesson_id = 'sql-joins'), now(), 'Passed check refreshes timestamp');

select throws_ok($$select public.record_lesson_check('api-errors', '{}', 1, gen_random_uuid(), false)$$,
                 '23514', null, 'Failed-check answers also require a number array');
select throws_ok($$select public.record_lesson_check('api-errors', '["0"]', 1, gen_random_uuid(), true)$$,
                 '23514', null, 'String answer rejected');
select throws_ok($$select public.record_lesson_check('api-errors', '[0,1]', -1, gen_random_uuid(), true)$$,
                 '22023', null, 'Negative duration rejected');
select throws_ok($$select public.record_lesson_check('api-errors', '[0,1]', 1441, gen_random_uuid(), true)$$,
                 '22023', null, 'Oversized duration rejected');
select throws_ok($$select public.record_lesson_check('api-errors', '[0,1]', 1, null, true)$$,
                 '22023', null, 'Missing event UUID rejected');
select throws_ok($$select public.record_lesson_check('api-errors', '[0,1]', 1, gen_random_uuid(), null)$$,
                 '22023', null, 'Missing passed flag rejected');
select throws_ok($$select public.record_lesson_check('missing-lesson', '[0,1]', 1, gen_random_uuid(), false)$$,
                 '23503', null, 'Missing lesson rolls back a failed check too');

-- Deterministic test-only failure/race injection. This exercises the fallback
-- branch without claiming a multi-connection concurrency/load test.
reset role;
create function pg_temp.inject_check_event_case() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid then
    raise exception 'Test-only check event failure' using errcode = 'P0001';
  elsif new.id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid and new.kind = 'lesson_completed' then
    insert into public.learning_events(id, user_id, lesson_id, kind, xp, minutes, check_answers)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', new.user_id, new.lesson_id, 'lesson_completed', 50, 1, new.check_answers);
  end if;
  return new;
end;
$$;
create trigger inject_check_event_case before insert on public.learning_events
  for each row execute function pg_temp.inject_check_event_case();
set local role authenticated;
select throws_ok($$select public.record_lesson_check('api-errors', '[0,1]', 10, 'ffffffff-ffff-4fff-8fff-ffffffffffff', true)$$,
                 'P0001', 'Test-only check event failure', 'Event failure aborts a passed check');
select is((select count(*) from public.lesson_progress where lesson_id = 'api-errors'), 0::bigint, 'Passed-event error rolls back new progress');
select throws_ok($$select public.record_lesson_check('git-recovery', '[2,2]', 1, 'ffffffff-ffff-4fff-8fff-ffffffffffff', false)$$,
                 'P0001', 'Test-only check event failure', 'Event failure aborts a failed review');
select is((select answers from public.lesson_progress where lesson_id = 'git-recovery'), '[0,0]'::jsonb, 'Failed-event error rolls back changed answers');
select is((select count(*) from public.learning_events where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'), 0::bigint, 'Aborted checks leave no event');
select lives_ok($$select public.record_lesson_check('js-async', '[1,2]', 14, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true)$$,
                'Losing completion insertion falls back to practice');
select is((select kind from public.learning_events where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'practice', 'Conflict fallback preserves the distinct attempt');
select is((select sum(xp) from public.learning_events where lesson_id = 'js-async'), 50::bigint, 'Conflict fallback still awards only 50 XP');
select is((select count(*) from public.learning_events where lesson_id = 'js-async'), 2::bigint, 'Both distinct successful checks are represented');

select throws_ok($$update public.profiles set display_name = repeat('a', 41) where id = auth.uid()$$,
                 '23514', null, 'Profile name rejects 41 characters');
select throws_ok($$update public.profiles set display_name = '   ' where id = auth.uid()$$,
                 '23514', null, 'Profile name rejects whitespace only');
select throws_ok($$update public.profiles set display_name = ' Learner ' where id = auth.uid()$$,
                 '23514', null, 'Profile name must be trimmed before saving');
select lives_ok($$update public.profiles set display_name = repeat('a', 40) where id = auth.uid()$$,
                'Profile name accepts 40 characters');
select lives_ok($$update public.profiles set display_name = 'A' where id = auth.uid()$$,
                'Profile name accepts one character');
select throws_ok($$update public.profiles set daily_goal_minutes = 15 where id = auth.uid()$$,
                 '23514', null, 'Goal rejects a value outside the UI options');
select lives_ok(format('update public.profiles set daily_goal_minutes = %s where id = auth.uid()', minutes),
                'Goal accepts UI option ' || minutes::text) from unnest(array[10,20,30,45,60]) as goals(minutes);

reset role;
delete from private.owner;
set local role authenticated;
select throws_ok($$select public.record_lesson_check('react-effects', '[1,2]', 15, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true)$$,
                 '42501', null, 'Revoked owner cannot even replay an existing event');
reset role;
select * from finish();
rollback;
