-- Native Payment Voucher module with Staff visibility controls.
-- Run this file in Supabase SQL Editor.

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
  receiving_company text, payment_reason text, remarks text, narration text, payment_mode text,
  reference_no text, prepared_by_name text, approved_by_name text, received_by_name text,
  visible_to_staff boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'saved', 'cancelled')),
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (application_id, installment_no)
);

alter table public.payment_vouchers alter column application_id drop not null;
alter table public.payment_vouchers add column if not exists voucher_type text not null default 'payment';
alter table public.payment_vouchers add column if not exists visible_to_staff boolean not null default false;
alter table public.payment_vouchers drop constraint if exists payment_vouchers_voucher_type_check;
alter table public.payment_vouchers add constraint payment_vouchers_voucher_type_check check (voucher_type in ('payment', 'receipt'));

create table if not exists public.voucher_cheques (
  id uuid primary key default gen_random_uuid(), voucher_id uuid not null references public.payment_vouchers(id) on delete cascade,
  serial_no integer not null check (serial_no > 0), cheque_no text, cheque_date date, bank_name text,
  in_favour_of text, amount numeric(14,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(), unique (voucher_id, serial_no)
);

create index if not exists payment_vouchers_application_idx on public.payment_vouchers(application_id);
create index if not exists payment_vouchers_company_idx on public.payment_vouchers(company_id);
create index if not exists voucher_cheques_voucher_idx on public.voucher_cheques(voucher_id);

create or replace function public.set_payment_voucher_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists payment_vouchers_set_updated_at on public.payment_vouchers;
create trigger payment_vouchers_set_updated_at before update on public.payment_vouchers for each row execute function public.set_payment_voucher_updated_at();

alter table public.payment_vouchers enable row level security;
alter table public.voucher_cheques enable row level security;

drop policy if exists "Authenticated users can view payment vouchers" on public.payment_vouchers;
create policy "Authenticated users can view payment vouchers" on public.payment_vouchers for select to authenticated using (
  exists (select 1 from public.users where id = auth.uid() and role in ('finance', 'cfo', 'ceo', 'superadmin'))
  or (
    exists (select 1 from public.users where id = auth.uid() and role = 'staff')
    and exists (select 1 from public.user_companies where user_id = auth.uid() and company_id = payment_vouchers.company_id)
    and (
      (voucher_type = 'receipt' and exists (select 1 from public.users creator where creator.id = payment_vouchers.created_by and creator.role = 'staff'))
      or visible_to_staff = true
    )
  )
);

drop policy if exists "Finance roles can create payment vouchers" on public.payment_vouchers;
drop policy if exists "Finance and staff can create payment vouchers" on public.payment_vouchers;
create policy "Finance and staff can create payment vouchers" on public.payment_vouchers for insert to authenticated with check (
  created_by = auth.uid() and (
    exists (select 1 from public.users where id = auth.uid() and role in ('finance', 'cfo', 'ceo', 'superadmin'))
    or (voucher_type = 'receipt' and application_id is null and exists (select 1 from public.users where id = auth.uid() and role = 'staff'))
    or (application_id is not null and exists (select 1 from public.users where id = auth.uid() and role = 'staff') and exists (select 1 from public.applications where id = application_id and submitted_by = auth.uid()))
  )
);

drop policy if exists "Finance roles can update payment vouchers" on public.payment_vouchers;
drop policy if exists "Finance and staff can update payment vouchers" on public.payment_vouchers;
create policy "Finance and staff can update payment vouchers" on public.payment_vouchers for update to authenticated
using (
  exists (select 1 from public.users where id = auth.uid() and role in ('finance', 'cfo', 'ceo', 'superadmin'))
  or (created_by = auth.uid() and status = 'draft' and exists (select 1 from public.users where id = auth.uid() and role = 'staff'))
)
with check (
  exists (select 1 from public.users where id = auth.uid() and role in ('finance', 'cfo', 'ceo', 'superadmin'))
  or (created_by = auth.uid() and exists (select 1 from public.users where id = auth.uid() and role = 'staff'))
);

drop policy if exists "Super admins can delete payment vouchers" on public.payment_vouchers;
create policy "Super admins can delete payment vouchers" on public.payment_vouchers for delete to authenticated using (
  exists (select 1 from public.users where id = auth.uid() and role = 'superadmin')
);

drop policy if exists "Authenticated users can view voucher cheques" on public.voucher_cheques;
create policy "Authenticated users can view voucher cheques" on public.voucher_cheques for select to authenticated using (
  exists (select 1 from public.payment_vouchers voucher where voucher.id = voucher_cheques.voucher_id and (
    exists (select 1 from public.users where id = auth.uid() and role in ('finance', 'cfo', 'ceo', 'superadmin'))
    or (exists (select 1 from public.users where id = auth.uid() and role = 'staff') and exists (select 1 from public.user_companies where user_id = auth.uid() and company_id = voucher.company_id) and ((voucher.voucher_type = 'receipt' and exists (select 1 from public.users creator where creator.id = voucher.created_by and creator.role = 'staff')) or voucher.visible_to_staff = true))
  ))
);

drop policy if exists "Finance roles can manage voucher cheques" on public.voucher_cheques;
drop policy if exists "Finance and staff can manage voucher cheques" on public.voucher_cheques;
create policy "Finance and staff can manage voucher cheques" on public.voucher_cheques for all to authenticated
using (
  exists (select 1 from public.users where id = auth.uid() and role in ('finance', 'cfo', 'ceo', 'superadmin'))
  or exists (select 1 from public.payment_vouchers voucher where voucher.id = voucher_id and voucher.created_by = auth.uid() and voucher.status = 'draft' and exists (select 1 from public.users where id = auth.uid() and role = 'staff'))
)
with check (
  exists (select 1 from public.users where id = auth.uid() and role in ('finance', 'cfo', 'ceo', 'superadmin'))
  or exists (select 1 from public.payment_vouchers voucher where voucher.id = voucher_id and voucher.created_by = auth.uid() and exists (select 1 from public.users where id = auth.uid() and role = 'staff'))
);

grant select, insert, update, delete on public.payment_vouchers to authenticated;
grant select, insert, update, delete on public.voucher_cheques to authenticated;

-- Returns only the next number (not voucher data), so hidden vouchers can still
-- keep the company receipt/payment sequence continuous.
create or replace function public.next_standalone_voucher_number(p_company_id uuid, p_voucher_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  company_prefix text;
  code text;
  max_sequence integer;
begin
  if not exists (select 1 from public.user_companies where user_id = auth.uid() and company_id = p_company_id) then
    raise exception 'You are not assigned to this company';
  end if;
  if p_voucher_type not in ('payment', 'receipt') then
    raise exception 'Invalid voucher type';
  end if;
  select upper(prefix) into company_prefix from public.companies where id = p_company_id;
  if company_prefix is null then raise exception 'Company not found'; end if;
  code := case when p_voucher_type = 'receipt' then 'RV' else 'PV' end;
  select coalesce(max((substring(voucher_number from ('^' || company_prefix || code || '-([0-9]+)$'))::integer)), 0)
    into max_sequence
    from public.payment_vouchers
    where company_id = p_company_id and application_id is null and voucher_type = p_voucher_type;
  return company_prefix || code || '-' || lpad((max_sequence + 1)::text, 4, '0');
end;
$$;
grant execute on function public.next_standalone_voucher_number(uuid, text) to authenticated;
