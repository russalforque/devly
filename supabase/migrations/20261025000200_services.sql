begin;

-- No prompts, code, inputs, provider identifiers or keys are stored here.
create table private.service_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('mentor', 'execute')),
  consumed_at timestamptz[] not null default '{}',
  primary key (user_id, service),
  check (cardinality(consumed_at) <= 30)
);
alter table private.service_usage owner to postgres;
alter table private.service_usage enable row level security;
revoke all on private.service_usage from public, anon, authenticated, service_role;

-- One locked row per caller/service serializes concurrent requests across instances.
-- Sliding 60-second and 24-hour windows avoid boundary bursts; denied attempts do
-- not consume a slot. Accepted attempts consume one even if a provider later fails.
create function public.consume_service_budget(service text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  service_name text := service;
  stamps timestamptz[];
  current_time_at_lock timestamptz;
  minute_count integer;
begin
  if caller is null or not public.is_owner() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if service_name is null or service_name not in ('mentor', 'execute') then
    raise exception 'Unknown service' using errcode = '22023';
  end if;

  insert into private.service_usage (user_id, service)
    values (caller, service_name)
    on conflict do nothing;
  select u.consumed_at into stamps
    from private.service_usage as u
    where u.user_id = caller and u.service = service_name
    for update;
  current_time_at_lock := pg_catalog.clock_timestamp();

  select coalesce(pg_catalog.array_agg(t.stamp), '{}'::timestamptz[]),
    count(*) filter (where t.stamp > current_time_at_lock - interval '60 seconds')
    into stamps, minute_count
    from pg_catalog.unnest(stamps) as t(stamp)
    where t.stamp > current_time_at_lock - interval '24 hours';

  if minute_count >= 5 or pg_catalog.cardinality(stamps) >= 30 then
    return false;
  end if;
  update private.service_usage as u
    set consumed_at = pg_catalog.array_append(stamps, current_time_at_lock)
    where u.user_id = caller and u.service = service_name;
  return true;
end;
$$;
alter function public.consume_service_budget(text) owner to postgres;
revoke all on function public.consume_service_budget(text) from public, anon, authenticated, service_role;
grant execute on function public.consume_service_budget(text) to authenticated;
comment on function public.consume_service_budget(text) is
  'Owner-only atomic per-service budget: 5 requests per rolling minute, 30 per rolling 24 hours. Identity comes exclusively from auth.uid().';

commit;
