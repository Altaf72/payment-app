-- Native Payment Voucher module.
-- Run this file once in the Supabase SQL Editor before using the voucher screen.

create extension if not exists pgcrypto;

create table if not exists public.payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete restrict,
  company_id uuid references public.companies(id) on delete restrict,
  voucher_type text not null default 'payment' check (voucher_type in ('payment', 'receipt')),
  voucher_number text not null unique,
  installment_no integer not null default 1 check (installment_no > 0),
  voucher_date date not null default current_date,
  paid_to text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'AED',
  receiving_company text,
  payment_reason text,
  remarks text,
  narration text,
  payment_mode text,
  reference_no text,
  prepared_by_name text,
  approved_by_name text,
  received_by_name text,
  status text not null default 'draft' check (status in ('draft', 'saved', 'cancelled')),
  created_by uuid not null references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, installment_no)
);

-- Existing installations may still have application_id marked NOT NULL.
alter table public.payment_vouchers
  alter column application_id drop not null;

alter table public.payment_vouchers
  add column if not exists voucher_type text not null default 'payment';

alter table public.payment_vouchers
  drop constraint if exists payment_vouchers_voucher_type_check;

alter table public.payment_vouchers
  add constraint payment_vouchers_voucher_type_check
  check (voucher_type in ('payment', 'receipt'));

create table if not exists public.voucher_cheques (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.payment_vouchers(id) on delete cascade,
  serial_no integer not null check (serial_no > 0),
  cheque_no text,
  cheque_date date,
  bank_name text,
  in_favour_of text,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (voucher_id, serial_no)
);

create index if not exists payment_vouchers_application_idx
  on public.payment_vouchers(application_id);

create index if not exists payment_vouchers_company_idx
  on public.payment_vouchers(company_id);

create index if not exists voucher_cheques_voucher_idx
  on public.voucher_cheques(voucher_id);

create or replace function public.set_payment_voucher_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_vouchers_set_updated_at on public.payment_vouchers;
create trigger payment_vouchers_set_updated_at
before update on public.payment_vouchers
for each row execute function public.set_payment_voucher_updated_at();

alter table public.payment_vouchers enable row level security;
alter table public.voucher_cheques enable row level security;

drop policy if exists "Authenticated users can view payment vouchers" on public.payment_vouchers;
create policy "Authenticated users can view payment vouchers"
on public.payment_vouchers for select
to authenticated
using (true);

drop policy if exists "Finance roles can create payment vouchers" on public.payment_vouchers;
create policy "Finance roles can create payment vouchers"
on public.payment_vouchers for insert
to authenticated
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('finance', 'cfo', 'ceo', 'superadmin')
  )
);

drop policy if exists "Finance roles can update payment vouchers" on public.payment_vouchers;
create policy "Finance roles can update payment vouchers"
on public.payment_vouchers for update
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('finance', 'cfo', 'ceo', 'superadmin')
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('finance', 'cfo', 'ceo', 'superadmin')
  )
);

drop policy if exists "Authenticated users can view voucher cheques" on public.voucher_cheques;
create policy "Authenticated users can view voucher cheques"
on public.voucher_cheques for select
to authenticated
using (true);

drop policy if exists "Finance roles can manage voucher cheques" on public.voucher_cheques;
create policy "Finance roles can manage voucher cheques"
on public.voucher_cheques for all
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('finance', 'cfo', 'ceo', 'superadmin')
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('finance', 'cfo', 'ceo', 'superadmin')
  )
);

grant select, insert, update on public.payment_vouchers to authenticated;
grant select, insert, update, delete on public.voucher_cheques to authenticated;
