-- Immutable, shared DTCM reconciliation snapshots.
create extension if not exists pgcrypto;
create table if not exists public.dtcm_reconciliation_archives (
  id uuid primary key default gen_random_uuid(),
  company_name text, registration_id text, period_start date, period_end date,
  reconciliation_type text not null default 'dtcm_internal',
  summary jsonb not null default '{}'::jsonb,
  snapshot jsonb not null,
  archived_by uuid not null references public.users(id), archived_at timestamptz not null default now(),
  version integer not null default 1, note text
);
create index if not exists dtcm_archive_period_idx on public.dtcm_reconciliation_archives(period_start desc);
alter table public.dtcm_reconciliation_archives enable row level security;
create policy "Finance creates DTCM archives" on public.dtcm_reconciliation_archives for insert to authenticated with check (exists(select 1 from public.users where id=auth.uid() and role='finance'));
create policy "Finance leadership views DTCM archives" on public.dtcm_reconciliation_archives for select to authenticated using (exists(select 1 from public.users where id=auth.uid() and role in ('finance','cfo','manager','superadmin')));
grant select,insert on public.dtcm_reconciliation_archives to authenticated;
