-- Imprest Fund Management module. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.imprest_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  custodian text not null,
  notes text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists imprest_accounts_company_idx on public.imprest_accounts(company_id);

create table if not exists public.imprest_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.imprest_accounts(id) on delete restrict,
  transaction_date date not null,
  description text not null check (length(trim(description)) > 0),
  transaction_type text not null check (transaction_type in ('top_up','expense','adjustment')),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  created_by uuid references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (not (debit > 0 and credit > 0))
);
create index if not exists imprest_transactions_account_date_idx on public.imprest_transactions(account_id, transaction_date, created_at);

create table if not exists public.imprest_audit_log (
  id uuid primary key default gen_random_uuid(), account_id uuid references public.imprest_accounts(id) on delete set null,
  transaction_id uuid references public.imprest_transactions(id) on delete set null,
  action text not null, action_by uuid references public.users(id), previous_values jsonb, new_values jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_imprest_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists imprest_accounts_updated_at on public.imprest_accounts;
create trigger imprest_accounts_updated_at before update on public.imprest_accounts for each row execute function public.set_imprest_updated_at();
drop trigger if exists imprest_transactions_updated_at on public.imprest_transactions;
create trigger imprest_transactions_updated_at before update on public.imprest_transactions for each row execute function public.set_imprest_updated_at();

alter table public.imprest_accounts enable row level security;
alter table public.imprest_transactions enable row level security;
alter table public.imprest_audit_log enable row level security;
create policy "Finance manages imprest accounts" on public.imprest_accounts for all to authenticated using (exists(select 1 from public.users where id=auth.uid() and role in ('finance','cfo','superadmin'))) with check (exists(select 1 from public.users where id=auth.uid() and role in ('finance','cfo','superadmin')));
create policy "Finance manages imprest transactions" on public.imprest_transactions for all to authenticated using (exists(select 1 from public.users where id=auth.uid() and role in ('finance','cfo','superadmin'))) with check (exists(select 1 from public.users where id=auth.uid() and role in ('finance','cfo','superadmin')));
create policy "Finance reads imprest audit" on public.imprest_audit_log for all to authenticated using (exists(select 1 from public.users where id=auth.uid() and role in ('finance','cfo','superadmin'))) with check (exists(select 1 from public.users where id=auth.uid() and role in ('finance','cfo','superadmin')));
grant select,insert,update,delete on public.imprest_accounts,public.imprest_transactions,public.imprest_audit_log to authenticated;
