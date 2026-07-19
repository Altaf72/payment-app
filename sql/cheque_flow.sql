-- ChequeFlow: run once in the Supabase SQL Editor before opening the screen.
create extension if not exists pgcrypto;

create table if not exists public.cheque_flow_entries (
  id uuid primary key default gen_random_uuid(),
  direction text not null default 'payable' check (direction in ('payable', 'receivable')),
  cheque_no text,
  source_import_key text unique,
  property_key text,
  entity text,
  due_date date not null,
  cleared_date date,
  property_name text,
  unit_name text,
  counterparty text not null,
  bank_name text,
  category text,
  recurrence_frequency text,
  source_status text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'AED' check (char_length(currency) = 3),
  status text not null default 'pending' check (status in ('pending', 'cleared', 'on_hold', 'returned', 'cancelled')),
  notes text,
  created_by uuid not null references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cheque_flow_entries add column if not exists source_import_key text;
alter table public.cheque_flow_entries add column if not exists property_key text;
alter table public.cheque_flow_entries add column if not exists entity text;
alter table public.cheque_flow_entries add column if not exists recurrence_frequency text;
alter table public.cheque_flow_entries add column if not exists source_status text;
create unique index if not exists cheque_flow_source_import_key_idx on public.cheque_flow_entries(source_import_key);
create index if not exists cheque_flow_due_date_idx on public.cheque_flow_entries(due_date);
create index if not exists cheque_flow_status_idx on public.cheque_flow_entries(status);
create index if not exists cheque_flow_property_key_idx on public.cheque_flow_entries(property_key);

create table if not exists public.cheque_flow_properties (
  id uuid primary key default gen_random_uuid(),
  property_key text not null unique,
  record_type text not null default 'Property',
  property_unit text,
  entity text,
  payee_owner text,
  contract_start date,
  contract_end date,
  annual_rent numeric(14,2),
  total_installments integer,
  property_status text,
  owner_nationality text,
  management_type text,
  created_by uuid not null references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cheque_flow_deposits (
  id uuid primary key default gen_random_uuid(),
  property_key text not null unique references public.cheque_flow_properties(property_key) on delete cascade,
  rental_deposit numeric(14,2) not null default 0,
  dewa_deposit numeric(14,2) not null default 0,
  chiller_deposit numeric(14,2) not null default 0,
  gas_deposit numeric(14,2) not null default 0,
  other_deposit numeric(14,2) not null default 0,
  remark text,
  created_by uuid not null references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_cheque_flow_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists cheque_flow_set_updated_at on public.cheque_flow_entries;
create trigger cheque_flow_set_updated_at before update on public.cheque_flow_entries for each row execute function public.set_cheque_flow_updated_at();

alter table public.cheque_flow_entries enable row level security;
alter table public.cheque_flow_properties enable row level security;
alter table public.cheque_flow_deposits enable row level security;
drop policy if exists "ChequeFlow finance can view" on public.cheque_flow_entries;
create policy "ChequeFlow finance can view" on public.cheque_flow_entries for select to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin')));
drop policy if exists "ChequeFlow finance can insert" on public.cheque_flow_entries;
create policy "ChequeFlow finance can insert" on public.cheque_flow_entries for insert to authenticated with check (auth.uid() = created_by and exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin')));
drop policy if exists "ChequeFlow finance can update" on public.cheque_flow_entries;
create policy "ChequeFlow finance can update" on public.cheque_flow_entries for update to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin'))) with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin')));
drop policy if exists "ChequeFlow finance can delete" on public.cheque_flow_entries;
create policy "ChequeFlow finance can delete" on public.cheque_flow_entries for delete to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin')));

drop policy if exists "ChequeFlow finance manages properties" on public.cheque_flow_properties;
create policy "ChequeFlow finance manages properties" on public.cheque_flow_properties for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin'))) with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin')));
drop policy if exists "ChequeFlow finance manages deposits" on public.cheque_flow_deposits;
create policy "ChequeFlow finance manages deposits" on public.cheque_flow_deposits for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin'))) with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin')));
