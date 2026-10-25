-- Optional pgTAP integration checks. Run against a disposable migrated Supabase
-- database with: supabase test db server/tests/service-budget.sql
-- All fixtures and changes roll back. No provider calls are made.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
grant usage on schema extensions to authenticated, anon;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('11111111-1111-4111-8111-111111110021', 'authenticated', 'authenticated', 'service-owner@example.invalid'),
  ('22222222-2222-4222-8222-222222220021', 'authenticated', 'authenticated', 'service-other@example.invalid');
delete from private.owner;
insert into private.owner(user_id) values ('11111111-1111-4111-8111-111111110021');

select ok(not has_function_privilege('anon', 'public.consume_service_budget(text)', 'execute'), 'Anonymous has no execute grant');
select ok(not has_function_privilege('service_role', 'public.consume_service_budget(text)', 'execute'), 'No service-role execute grant');
select ok(has_function_privilege('authenticated', 'public.consume_service_budget(text)', 'execute'), 'Authenticated can call checked RPC');
select ok(not has_table_privilege('authenticated', 'private.service_usage', 'select'), 'Usage table is private');
select ok((select prosecdef from pg_proc where oid = 'public.consume_service_budget(text)'::regprocedure), 'RPC is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.consume_service_budget(text)'::regprocedure), 'RPC search path is fixed empty');

set local role authenticated;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.consume_service_budget('mentor')$$, '42501', null, 'Missing UUID is denied');
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222220021","role":"authenticated"}';
select throws_ok($$select public.consume_service_budget('mentor')$$, '42501', null, 'Nonowner is denied');
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111110021","role":"authenticated"}';
select throws_ok($$select public.consume_service_budget('arbitrary')$$, '22023', null, 'Service allowlist enforced');
select throws_ok($$select public.consume_service_budget(null)$$, '22023', null, 'Null service rejected');
select throws_ok($$select * from private.service_usage$$, '42501', null, 'Owner cannot inspect usage directly');
select ok(public.consume_service_budget('mentor'), 'First minute request accepted');
select ok(public.consume_service_budget('mentor'), 'Second minute request accepted');
select ok(public.consume_service_budget('mentor'), 'Third minute request accepted');
select ok(public.consume_service_budget('mentor'), 'Fourth minute request accepted');
select ok(public.consume_service_budget('mentor'), 'Fifth minute request accepted');
select ok(not public.consume_service_budget('mentor'), 'Sixth minute request denied');
select ok(public.consume_service_budget('execute'), 'Services have independent budgets');

reset role;
select is((select cardinality(consumed_at) from private.service_usage where service = 'mentor' and user_id = '11111111-1111-4111-8111-111111110021'), 5, 'Denied attempts do not consume slots');
update private.service_usage set consumed_at = array_fill(clock_timestamp() - interval '2 minutes', array[30])
  where service = 'mentor' and user_id = '11111111-1111-4111-8111-111111110021';
set local role authenticated;
select ok(not public.consume_service_budget('mentor'), 'Thirty attempts in rolling day denied even outside minute window');
reset role;
update private.service_usage set consumed_at = array_fill(clock_timestamp() - interval '2 minutes', array[29])
  where service = 'mentor' and user_id = '11111111-1111-4111-8111-111111110021';
set local role authenticated;
select ok(public.consume_service_budget('mentor'), 'Thirtieth rolling-day attempt accepted');
select ok(not public.consume_service_budget('mentor'), 'Thirty-first rolling-day attempt denied');
reset role;
update private.service_usage set consumed_at = array_fill(clock_timestamp() - interval '25 hours', array[30])
  where service = 'mentor' and user_id = '11111111-1111-4111-8111-111111110021';
set local role authenticated;
select ok(public.consume_service_budget('mentor'), 'Expired timestamps release budget');
reset role;
select is((select cardinality(consumed_at) from private.service_usage where service = 'mentor' and user_id = '11111111-1111-4111-8111-111111110021'), 1, 'Expired timestamps are pruned');
delete from private.owner;
set local role authenticated;
select throws_ok($$select public.consume_service_budget('mentor')$$, '42501', null, 'Revoked owner is denied');
reset role;

select * from finish();
rollback;
