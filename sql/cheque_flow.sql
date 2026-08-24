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
  is_undated boolean not null default false,
  property_name text,
  unit_name text,
  counterparty text not null,
  bank_name text,
  category text,
  payment_mode text,
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
alter table public.cheque_flow_entries add column if not exists payment_mode text;
alter table public.cheque_flow_entries add column if not exists source_status text;
alter table public.cheque_flow_entries add column if not exists is_undated boolean not null default false;
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

create table if not exists public.cheque_flow_setup_lists (
  list_name text primary key,
  values_json jsonb not null default '[]'::jsonb,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.cheque_flow_dataset_archives (
  id uuid primary key default gen_random_uuid(),
  archived_at timestamptz not null default now(),
  archived_by uuid not null references public.users(id),
  reason text not null default 'Workbook replacement',
  counts jsonb not null default '{}'::jsonb,
  entries_snapshot jsonb not null default '[]'::jsonb,
  properties_snapshot jsonb not null default '[]'::jsonb,
  deposits_snapshot jsonb not null default '[]'::jsonb,
  setup_lists_snapshot jsonb not null default '[]'::jsonb
);
create index if not exists cheque_flow_archives_date_idx on public.cheque_flow_dataset_archives(archived_at desc);

-- Receipts are historical records. Preserve their property label before
-- detaching them from the replaceable workbook property master.
do $$
begin
  if to_regclass('public.holiday_home_receipts') is not null then
    alter table public.holiday_home_receipts add column if not exists property_display text;
    update public.holiday_home_receipts r
    set property_display = coalesce(p.property_unit, r.property_key)
    from public.cheque_flow_properties p
    where p.property_key = r.property_key
      and nullif(trim(r.property_display), '') is null;
    alter table public.holiday_home_receipts
      drop constraint if exists holiday_home_receipts_property_key_fkey;
  end if;
end $$;

create or replace function public.set_cheque_flow_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists cheque_flow_set_updated_at on public.cheque_flow_entries;
create trigger cheque_flow_set_updated_at before update on public.cheque_flow_entries for each row execute function public.set_cheque_flow_updated_at();

alter table public.cheque_flow_entries enable row level security;
alter table public.cheque_flow_properties enable row level security;
alter table public.cheque_flow_deposits enable row level security;
alter table public.cheque_flow_setup_lists enable row level security;
alter table public.cheque_flow_dataset_archives enable row level security;
drop policy if exists "ChequeFlow finance can view" on public.cheque_flow_entries;
create policy "ChequeFlow finance can view" on public.cheque_flow_entries for select to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','cfo','superadmin')));
drop policy if exists "ChequeFlow finance can insert" on public.cheque_flow_entries;
create policy "ChequeFlow finance can insert" on public.cheque_flow_entries for insert to authenticated with check (auth.uid() = created_by and exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer')));
drop policy if exists "ChequeFlow finance can update" on public.cheque_flow_entries;
create policy "ChequeFlow finance can update" on public.cheque_flow_entries for update to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer'))) with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer')));
drop policy if exists "ChequeFlow finance can delete" on public.cheque_flow_entries;
create policy "ChequeFlow finance can delete" on public.cheque_flow_entries for delete to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer')));

drop policy if exists "ChequeFlow finance manages properties" on public.cheque_flow_properties;
create policy "ChequeFlow finance manages properties" on public.cheque_flow_properties for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer'))) with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer')));
drop policy if exists "ChequeFlow finance views properties" on public.cheque_flow_properties;
create policy "ChequeFlow finance views properties" on public.cheque_flow_properties for select to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer','cfo','superadmin')));
drop policy if exists "ChequeFlow finance manages deposits" on public.cheque_flow_deposits;
create policy "ChequeFlow finance manages deposits" on public.cheque_flow_deposits for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer'))) with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer')));
drop policy if exists "ChequeFlow finance views deposits" on public.cheque_flow_deposits;
create policy "ChequeFlow finance views deposits" on public.cheque_flow_deposits for select to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer','cfo','superadmin')));
drop policy if exists "ChequeFlow finance manages setup lists" on public.cheque_flow_setup_lists;
create policy "ChequeFlow finance manages setup lists" on public.cheque_flow_setup_lists for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer'))) with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer')));
drop policy if exists "ChequeFlow finance views setup lists" on public.cheque_flow_setup_lists;
create policy "ChequeFlow finance views setup lists" on public.cheque_flow_setup_lists for select to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','finance_officer','cfo','superadmin')));

drop policy if exists "ChequeFlow finance views replacement archives" on public.cheque_flow_dataset_archives;
create policy "ChequeFlow finance views replacement archives" on public.cheque_flow_dataset_archives
  for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','superadmin')));

create or replace function public.replace_cheque_flow_dataset(
  p_entries jsonb,
  p_properties jsonb,
  p_deposits jsonb,
  p_setup_lists jsonb,
  p_expected_entries integer,
  p_expected_properties integer,
  p_expected_deposits integer,
  p_expected_setup_lists integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_archive_id uuid;
  v_entries integer;
  v_properties integer;
  v_deposits integer;
  v_setup integer;
begin
  if v_user_id is null or not exists (
    select 1 from public.users where id = v_user_id and role in ('finance','finance_officer')
  ) then
    raise exception 'Only Finance users can replace the ChequeFlow dataset';
  end if;

  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_properties, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_deposits, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_setup_lists, '[]'::jsonb)) <> 'array' then
    raise exception 'Replacement payload must contain arrays';
  end if;

  perform pg_advisory_xact_lock(hashtext('replace_cheque_flow_dataset'));

  insert into public.cheque_flow_dataset_archives (
    archived_by, counts, entries_snapshot, properties_snapshot,
    deposits_snapshot, setup_lists_snapshot
  )
  select v_user_id,
    jsonb_build_object(
      'entries', (select count(*) from public.cheque_flow_entries),
      'properties', (select count(*) from public.cheque_flow_properties),
      'deposits', (select count(*) from public.cheque_flow_deposits),
      'setup_lists', (select count(*) from public.cheque_flow_setup_lists)
    ),
    coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id) from public.cheque_flow_entries e), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at, p.id) from public.cheque_flow_properties p), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at, d.id) from public.cheque_flow_deposits d), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(s) order by s.list_name) from public.cheque_flow_setup_lists s), '[]'::jsonb)
  returning id into v_archive_id;

  -- Explicit predicates satisfy Supabase's safe-update protection while still
  -- clearing the complete dataset inside this guarded transaction.
  delete from public.cheque_flow_entries where id is not null;
  delete from public.cheque_flow_deposits where id is not null;
  delete from public.cheque_flow_properties where id is not null;
  delete from public.cheque_flow_setup_lists where list_name is not null;

  insert into public.cheque_flow_properties (
    property_key, record_type, property_unit, entity, payee_owner,
    contract_start, contract_end, annual_rent, total_installments,
    property_status, owner_nationality, management_type, created_by, updated_by
  )
  select x.property_key, coalesce(x.record_type, 'Property'), x.property_unit,
    x.entity, x.payee_owner, x.contract_start, x.contract_end, x.annual_rent,
    x.total_installments, x.property_status, x.owner_nationality,
    x.management_type, v_user_id, v_user_id
  from jsonb_to_recordset(coalesce(p_properties, '[]'::jsonb)) as x(
    property_key text, record_type text, property_unit text, entity text,
    payee_owner text, contract_start date, contract_end date,
    annual_rent numeric, total_installments integer, property_status text,
    owner_nationality text, management_type text
  );

  insert into public.cheque_flow_deposits (
    property_key, rental_deposit, dewa_deposit, chiller_deposit,
    gas_deposit, other_deposit, remark, created_by, updated_by
  )
  select x.property_key, coalesce(x.rental_deposit, 0), coalesce(x.dewa_deposit, 0),
    coalesce(x.chiller_deposit, 0), coalesce(x.gas_deposit, 0),
    coalesce(x.other_deposit, 0), x.remark, v_user_id, v_user_id
  from jsonb_to_recordset(coalesce(p_deposits, '[]'::jsonb)) as x(
    property_key text, rental_deposit numeric, dewa_deposit numeric,
    chiller_deposit numeric, gas_deposit numeric, other_deposit numeric, remark text
  );

  insert into public.cheque_flow_entries (
    direction, cheque_no, source_import_key, property_key, entity, due_date,
    cleared_date, is_undated, property_name, unit_name, counterparty, bank_name, category,
    payment_mode, recurrence_frequency, source_status, amount, currency, status, notes,
    created_by, updated_by
  )
  select coalesce(x.direction, 'payable'), x.cheque_no, x.source_import_key,
    x.property_key, x.entity, x.due_date, x.cleared_date, coalesce(x.is_undated, false),
    x.property_name, x.unit_name, x.counterparty, x.bank_name, x.category,
    x.payment_mode, x.recurrence_frequency, x.source_status, x.amount, coalesce(x.currency, 'AED'),
    coalesce(x.status, 'pending'), x.notes, v_user_id, v_user_id
  from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as x(
    direction text, cheque_no text, source_import_key text, property_key text,
    entity text, due_date date, cleared_date date, is_undated boolean, property_name text,
    unit_name text, counterparty text, bank_name text, category text,
    payment_mode text, recurrence_frequency text, source_status text, amount numeric,
    currency text, status text, notes text
  );

  insert into public.cheque_flow_setup_lists (list_name, values_json, updated_by)
  select x.list_name, coalesce(x.values_json, '[]'::jsonb), v_user_id
  from jsonb_to_recordset(coalesce(p_setup_lists, '[]'::jsonb)) as x(
    list_name text, values_json jsonb
  );

  select count(*) into v_entries from public.cheque_flow_entries;
  select count(*) into v_properties from public.cheque_flow_properties;
  select count(*) into v_deposits from public.cheque_flow_deposits;
  select count(*) into v_setup from public.cheque_flow_setup_lists;

  if v_entries <> p_expected_entries or v_properties <> p_expected_properties
     or v_deposits <> p_expected_deposits or v_setup <> p_expected_setup_lists then
    raise exception 'Replacement verification failed: expected %/%/%/%, stored %/%/%/%',
      p_expected_entries, p_expected_properties, p_expected_deposits, p_expected_setup_lists,
      v_entries, v_properties, v_deposits, v_setup;
  end if;

  return jsonb_build_object(
    'archive_id', v_archive_id,
    'entries', v_entries,
    'properties', v_properties,
    'deposits', v_deposits,
    'setup_lists', v_setup
  );
end;
$$;

revoke all on function public.replace_cheque_flow_dataset(jsonb,jsonb,jsonb,jsonb,integer,integer,integer,integer) from public;
grant execute on function public.replace_cheque_flow_dataset(jsonb,jsonb,jsonb,jsonb,integer,integer,integer,integer) to authenticated;
