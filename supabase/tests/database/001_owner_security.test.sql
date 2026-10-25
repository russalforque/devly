-- Run with `supabase test db` after a local `supabase db reset`.
-- Synthetic identities exist only inside this rolled-back test transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
grant usage on schema extensions to anon, authenticated;
select no_plan();

create temporary table crud_fixtures (
  seq integer primary key,
  table_name text not null unique,
  personal boolean not null,
  insert_sql text not null,
  predicate text not null,
  update_set text not null
);
grant select on crud_fixtures to anon, authenticated;

-- Invoker-only test helper: never elevates the caller or ships in a migration.
create function pg_temp.affected_rows(command text) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare affected bigint;
begin
  execute command;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
grant execute on function pg_temp.affected_rows(text) to anon, authenticated;

insert into crud_fixtures values
  (1, 'profiles', true,
   $$insert into public.profiles(id, display_name) values ('11111111-1111-4111-8111-111111111111', 'Test owner')$$,
   $$id = '11111111-1111-4111-8111-111111111111'$$, $$display_name = 'Updated owner'$$),
  (2, 'technologies', false,
   $$insert into public.technologies(id, name, description) values ('security-test-tech', 'Security test', 'Fixture')$$,
   $$id = 'security-test-tech'$$, $$description = 'Updated fixture'$$),
  (3, 'learning_tracks', false,
   $$insert into public.learning_tracks(id, technology_id, title, description, difficulty, position) values ('security-test-track', 'security-test-tech', 'Fixture', 'Fixture', 'beginner', 999)$$,
   $$id = 'security-test-track'$$, $$title = 'Updated fixture'$$),
  (4, 'modules', false,
   $$insert into public.modules(id, track_id, title, description, position) values ('security-test-module', 'security-test-track', 'Fixture', 'Fixture', 1)$$,
   $$id = 'security-test-module'$$, $$title = 'Updated fixture'$$),
  (5, 'lessons', false,
   $$insert into public.lessons(id, module_id, title, summary, content_md, estimated_minutes, position) values ('security-test-lesson', 'security-test-module', 'Fixture', 'Fixture', 'Fixture', 5, 1)$$,
   $$id = 'security-test-lesson'$$, $$title = 'Updated fixture'$$),
  (6, 'challenges', false,
   $$insert into public.challenges(id, lesson_id, title, prompt_md, kind, solution_explanation, position) values ('security-test-challenge', 'security-test-lesson', 'Fixture', 'Fixture', 'short_answer', 'Fixture', 1)$$,
   $$id = 'security-test-challenge'$$, $$title = 'Updated fixture'$$),
  (7, 'challenge_test_cases', false,
   $$insert into public.challenge_test_cases(id, challenge_id, label, expected_output, position) values ('security-test-case', 'security-test-challenge', 'Fixture', '1', 1)$$,
   $$id = 'security-test-case'$$, $$label = 'Updated fixture'$$),
  (8, 'challenge_attempts', true,
   $$insert into public.challenge_attempts(user_id, challenge_id, outcome) values ('11111111-1111-4111-8111-111111111111', 'security-test-challenge', 'submitted')$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and challenge_id = 'security-test-challenge'$$,
   $$outcome = 'passed'$$),
  (9, 'lesson_progress', true,
   $$insert into public.lesson_progress(user_id, lesson_id, answers) values ('11111111-1111-4111-8111-111111111111', 'security-test-lesson', '[0,1]')$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and lesson_id = 'security-test-lesson'$$,
   $$status = 'completed', answers = '[1,2]'$$),
  (10, 'learning_events', true,
   $$insert into public.learning_events(user_id, lesson_id, kind, xp, minutes) values ('11111111-1111-4111-8111-111111111111', 'security-test-lesson', 'practice', 0, 5)$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and lesson_id = 'security-test-lesson'$$,
   $$minutes = 6$$),
  (11, 'bookmarks', true,
   $$insert into public.bookmarks(user_id, lesson_id) values ('11111111-1111-4111-8111-111111111111', 'security-test-lesson')$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and lesson_id = 'security-test-lesson'$$,
   $$created_at = created_at - interval '1 minute'$$),
  (12, 'skill_assessments', true,
   $$insert into public.skill_assessments(user_id, technology_id, score) values ('11111111-1111-4111-8111-111111111111', 'security-test-tech', 60)$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and technology_id = 'security-test-tech'$$,
   $$score = 70$$),
  (13, 'skill_mastery', true,
   $$insert into public.skill_mastery(user_id, technology_id) values ('11111111-1111-4111-8111-111111111111', 'security-test-tech')$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and technology_id = 'security-test-tech'$$,
   $$mastery_score = 70$$),
  (14, 'daily_activity', true,
   $$insert into public.daily_activity(user_id, activity_date) values ('11111111-1111-4111-8111-111111111111', '2026-10-24')$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and activity_date = '2026-10-24'$$,
   $$minutes = 10$$),
  (15, 'learning_goals', true,
   $$insert into public.learning_goals(user_id, track_id, title, target_minutes) values ('11111111-1111-4111-8111-111111111111', 'security-test-track', 'Fixture', 20)$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and track_id = 'security-test-track'$$,
   $$target_minutes = 30$$),
  (16, 'achievements', false,
   $$insert into public.achievements(id, title, description, metric, threshold) values ('security-test-achievement', 'Fixture', 'Fixture', 'lessons_completed', 1)$$,
   $$id = 'security-test-achievement'$$, $$title = 'Updated fixture'$$),
  (17, 'user_achievements', true,
   $$insert into public.user_achievements(user_id, achievement_id) values ('11111111-1111-4111-8111-111111111111', 'security-test-achievement')$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and achievement_id = 'security-test-achievement'$$,
   $$awarded_at = awarded_at - interval '1 minute'$$),
  (18, 'review_schedules', true,
   $$insert into public.review_schedules(user_id, lesson_id, due_at) values ('11111111-1111-4111-8111-111111111111', 'security-test-lesson', now())$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and lesson_id = 'security-test-lesson'$$,
   $$interval_days = 2$$),
  (19, 'interview_sessions', true,
   $$insert into public.interview_sessions(id, user_id, track_id) values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'security-test-track')$$,
   $$id = '33333333-3333-4333-8333-333333333333'$$,
   $$status = 'abandoned'$$),
  (20, 'interview_answers', true,
   $$insert into public.interview_answers(user_id, session_id, challenge_id, question_text, position) values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'security-test-challenge', 'Fixture', 1)$$,
   $$session_id = '33333333-3333-4333-8333-333333333333' and position = 1$$,
   $$answer_text = 'Updated fixture'$$);

insert into crud_fixtures values
  (21, 'feature_records', true,
   $$insert into public.feature_records(user_id, feature, record_key, payload) values ('11111111-1111-4111-8111-111111111111', 'coding', 'fixture', '{}')$$,
   $$user_id = '11111111-1111-4111-8111-111111111111' and feature = 'coding' and record_key = 'fixture'$$,
   $$payload = '{"verified":true}'$$);
select tables_are('public', array(select table_name from crud_fixtures order by table_name), 'All public application tables are covered');
select ok(c.relrowsecurity and c.relforcerowsecurity, f.table_name || ' enables and forces RLS')
from crud_fixtures f join pg_class c on c.oid = to_regclass('public.' || f.table_name);
select ok(not has_table_privilege('anon', 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
          table_name || ' grants no anonymous table privileges') from crud_fixtures;
select ok(not has_table_privilege('authenticated', 'public.' || table_name, 'TRUNCATE,REFERENCES,TRIGGER'),
          table_name || ' grants no non-RLS administrative privileges') from crud_fixtures;
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'Private schema is inaccessible');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'Clients cannot create public objects');
select ok(p.prosecdef and p.proconfig @> array['search_path=""'], 'is_owner has definer rights and a fixed empty search path')
from pg_proc p where p.oid = 'public.is_owner()'::regprocedure;
select ok(not p.prosecdef and p.proconfig @> array['search_path=""'], 'complete_lesson retains caller privileges and a fixed search path')
from pg_proc p where p.oid = 'public.complete_lesson(text,jsonb,integer,uuid)'::regprocedure;

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'devly-owner-test@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'devly-other-test@example.invalid');
delete from private.owner;

-- Fail closed before bootstrap, even with an otherwise valid authenticated JWT.
set local role authenticated;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.is_owner(), false, 'No owner configured means no authorized user');
select is(pg_temp.affected_rows('select * from public.lessons'), 0::bigint, 'Catalog is hidden before bootstrap');
select throws_ok($$insert into public.profiles(id) values ('11111111-1111-4111-8111-111111111111')$$,
                 '42501', null, 'Cannot self-authorize by creating a profile');
select throws_ok($$select public.complete_lesson('react-effects', '[1]', 10, gen_random_uuid())$$,
                 '42501', null, 'RPC fails closed before bootstrap');
reset role;

insert into private.owner (user_id) values ('11111111-1111-4111-8111-111111111111');
select throws_ok($$insert into private.owner(singleton, user_id) values (false, '22222222-2222-4222-8222-222222222222')$$,
                 '23514', null, 'False singleton cannot introduce a second owner');
select throws_ok($$insert into private.owner(user_id) values ('22222222-2222-4222-8222-222222222222')$$,
                 '23505', null, 'True singleton cannot introduce a second owner');
select throws_ok($$update private.owner set user_id = '99999999-9999-4999-8999-999999999999'$$,
                 '23503', null, 'Owner must reference an existing Auth account');

-- Foreign personal rows ensure isolation also applies to data belonging to a
-- nonowner's own UUID. Such rows could exist after an administrative owner change.
insert into public.profiles(id, display_name) values ('22222222-2222-4222-8222-222222222222', 'Other account');
insert into public.bookmarks(user_id, lesson_id) values ('22222222-2222-4222-8222-222222222222', 'react-effects');

set local role authenticated;
select is(public.is_owner(), true, 'Configured owner is recognized');
select lives_ok(insert_sql, 'Owner can insert ' || table_name) from crud_fixtures order by seq;
select is(pg_temp.affected_rows(format('select * from public.%I where %s', table_name, predicate)),
          1::bigint, 'Owner can read their ' || table_name || ' fixture') from crud_fixtures order by seq;
select is((select count(*) from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 0::bigint,
          'Owner cannot read a foreign profile');
select is((select count(*) from public.bookmarks where user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint,
          'Owner cannot read foreign personal rows');

select throws_ok(replace(insert_sql, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
                 '42501', null, 'Owner cannot insert foreign ' || table_name) from crud_fixtures where personal order by seq;
select throws_ok(format('update public.%I set %I = %L where %s', table_name,
                        case when table_name = 'profiles' then 'id' else 'user_id' end,
                        '22222222-2222-4222-8222-222222222222', predicate),
                 '42501', null, 'Owner cannot transfer ' || table_name || ' to another user')
from crud_fixtures where personal order by seq;
select throws_ok('select * from private.owner', '42501', null, 'Owner cannot directly read private.owner');
select throws_ok($$update private.owner set user_id = '22222222-2222-4222-8222-222222222222'$$,
                 '42501', null, 'Owner cannot change authorization through the API');

-- anon is denied by grants, including when an owner-looking sub is supplied.
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(format('select * from public.%I', table_name), '42501', null,
                 'Anonymous SELECT denied: ' || table_name) from crud_fixtures;
select throws_ok(insert_sql, '42501', null, 'Anonymous INSERT denied: ' || table_name) from crud_fixtures;
select throws_ok(format('update public.%I set %s where %s', table_name, update_set, predicate),
                 '42501', null, 'Anonymous UPDATE denied: ' || table_name) from crud_fixtures;
select throws_ok(format('delete from public.%I where %s', table_name, predicate),
                 '42501', null, 'Anonymous DELETE denied: ' || table_name) from crud_fixtures;
select throws_ok('select public.is_owner()', '42501', null, 'Anonymous cannot execute the owner helper');
select throws_ok($$select public.complete_lesson('react-effects', '[1]', 10, gen_random_uuid())$$,
                 '42501', null, 'Anonymous cannot execute completion RPC');
select throws_ok('select * from private.owner', '42501', null, 'Anonymous cannot inspect owner identity');
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"anon"}';
select throws_ok('select * from public.lessons', '42501', null, 'Anonymous role still denied with owner sub');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select is(public.is_owner(), false, 'Authenticated role without subject is denied');
select is(pg_temp.affected_rows('select * from public.lessons'), 0::bigint, 'Missing subject cannot read catalog');
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(public.is_owner(), false, 'Authenticated nonowner is denied');
select is(pg_temp.affected_rows(format('select * from public.%I', table_name)), 0::bigint,
          'Nonowner sees zero rows: ' || table_name) from crud_fixtures;
select throws_ok(replace(insert_sql, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
                 '42501', null, 'Nonowner INSERT denied: ' || table_name) from crud_fixtures order by seq;
select is(pg_temp.affected_rows(format('update public.%I set %s where %s', table_name, update_set, predicate)),
          0::bigint, 'Nonowner UPDATE affects no rows: ' || table_name) from crud_fixtures;
select is(pg_temp.affected_rows(format('delete from public.%I where %s', table_name, predicate)),
          0::bigint, 'Nonowner DELETE affects no rows: ' || table_name) from crud_fixtures;
select is(pg_temp.affected_rows($$update public.profiles set display_name = 'Unauthorized' where id = '22222222-2222-4222-8222-222222222222'$$),
          0::bigint, 'Nonowner cannot update even their own profile');
select is(pg_temp.affected_rows($$delete from public.bookmarks where user_id = '22222222-2222-4222-8222-222222222222'$$),
          0::bigint, 'Nonowner cannot delete even their own bookmark');
select throws_ok($$select public.complete_lesson('react-effects', '[1]', 10, gen_random_uuid())$$,
                 '42501', null, 'Nonowner completion RPC denied');
select throws_ok('select * from private.owner', '42501', null, 'Nonowner cannot inspect private.owner');
select throws_ok($$insert into private.owner(user_id) values ('22222222-2222-4222-8222-222222222222')$$,
                 '42501', null, 'Nonowner cannot self-enroll');
select throws_ok('delete from private.owner', '42501', null, 'Nonowner cannot remove the owner');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.affected_rows(format('update public.%I set %s where %s', table_name, update_set, predicate)),
          1::bigint, 'Owner UPDATE changes one row: ' || table_name) from crud_fixtures order by seq;
select is(pg_temp.affected_rows(format('delete from public.%I where %s', table_name, predicate)),
          1::bigint, 'Owner DELETE removes one row: ' || table_name) from crud_fixtures order by seq desc;

-- Revocation takes effect for the same JWT on the next statement.
reset role;
delete from private.owner;
set local role authenticated;
select is(public.is_owner(), false, 'Removing owner authorization revokes an existing session');
select is(pg_temp.affected_rows('select * from public.lessons'), 0::bigint, 'Revoked session cannot read catalog');
reset role;
select * from finish();
rollback;
