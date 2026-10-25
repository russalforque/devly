begin;

create table public.feature_records (
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null check (feature in ('coding', 'interviews', 'projects', 'assessments')),
  record_key text not null check (length(record_key) between 1 and 100),
  payload jsonb not null check (octet_length(payload::text) <= 2000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, record_key)
);
alter table public.feature_records enable row level security;
alter table public.feature_records force row level security;
revoke all on public.feature_records from public, anon, authenticated;
grant select, insert, update, delete on public.feature_records to authenticated;
create policy owner_access on public.feature_records for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_owner()))
  with check (user_id = (select auth.uid()) and (select public.is_owner()));

commit;
