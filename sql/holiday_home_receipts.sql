-- Holiday Home Receipt module: run once in Supabase SQL Editor.
alter table public.users add column if not exists holiday_home_receipts_enabled boolean not null default false;
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('staff','supervisor','gro','manager','finance','ceo','cfo','superadmin'));
alter table public.cheque_flow_properties add column if not exists actual_bedrooms integer;
alter table public.cheque_flow_properties add column if not exists display_bedrooms text;

-- Correct stale imported property display data.
update public.cheque_flow_properties
set property_unit = 'Creek Edge T1-1706',
    entity = 'HH'
where property_key = 'P005';

create table if not exists public.holiday_home_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  receipt_number text not null unique,
  receipt_date date not null default current_date,
  received_from text not null,
  id_passport text,
  property_key text not null,
  property_display text,
  check_in_date date not null,
  check_out_date date not null,
  nights integer not null check (nights > 0),
  rental_payment numeric(14,2) not null default 0,
  security_deposit numeric(14,2) not null default 0,
  admin_fee numeric(14,2) not null default 0,
  additional_service numeric(14,2) not null default 0,
  description text,
  payment_mode text,
  reference_no text,
  received_by_name text,
  administrator_name text,
  accounts_name text,
  customer_name text,
  created_by uuid not null references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.holiday_home_receipts add column if not exists property_display text;
alter table public.holiday_home_receipts add column if not exists status text not null default 'pending' check (status in ('pending','acknowledged','void'));
alter table public.holiday_home_receipts add column if not exists acknowledged_by uuid references public.users(id);
alter table public.holiday_home_receipts add column if not exists acknowledged_at timestamptz;
alter table public.holiday_home_receipts add column if not exists voided_by uuid references public.users(id);
alter table public.holiday_home_receipts add column if not exists voided_at timestamptz;
alter table public.holiday_home_receipts add column if not exists void_reason text;
update public.holiday_home_receipts set status='pending' where status is null;
update public.holiday_home_receipts r
set property_display = coalesce(p.property_unit, r.property_key)
from public.cheque_flow_properties p
where p.property_key = r.property_key
  and nullif(trim(r.property_display), '') is null;
alter table public.holiday_home_receipts drop constraint if exists holiday_home_receipts_property_key_fkey;
create index if not exists holiday_home_receipts_company_idx on public.holiday_home_receipts(company_id, receipt_date desc);

create or replace function public.next_holiday_home_receipt_number(p_company_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text; n integer;
begin
  if not exists (select 1 from public.user_companies where user_id=auth.uid() and company_id=p_company_id) then raise exception 'Company access denied'; end if;
  select upper(prefix) into p from public.companies where id=p_company_id;
  select coalesce(max((substring(receipt_number from ('^'||p||'R-([0-9]+)$'))::integer)),0) into n from public.holiday_home_receipts where company_id=p_company_id;
  return p||'R-'||lpad((n+1)::text,4,'0');
end; $$;

alter table public.holiday_home_receipts enable row level security;
drop policy if exists "Holiday receipt access" on public.holiday_home_receipts;
create policy "Holiday receipt access" on public.holiday_home_receipts for select to authenticated using (
  (created_by=auth.uid() or exists (select 1 from public.users where id=auth.uid() and role in ('superadmin','finance','cfo','supervisor','manager')))
  and exists (select 1 from public.user_companies where user_id=auth.uid() and company_id=holiday_home_receipts.company_id)
);
drop policy if exists "Holiday receipt create" on public.holiday_home_receipts;
create policy "Holiday receipt create" on public.holiday_home_receipts for insert to authenticated with check (
  created_by=auth.uid() and exists (select 1 from public.users where id=auth.uid() and (role in ('superadmin','supervisor') or holiday_home_receipts_enabled))
  and exists (select 1 from public.user_companies where user_id=auth.uid() and company_id=holiday_home_receipts.company_id)
);
drop policy if exists "Holiday receipt update" on public.holiday_home_receipts;
create policy "Holiday receipt update" on public.holiday_home_receipts for update to authenticated using (
  (created_by=auth.uid() or exists (select 1 from public.users where id=auth.uid() and lower(coalesce(role,'')) like '%finance%'))
  and exists (select 1 from public.user_companies where user_id=auth.uid() and company_id=holiday_home_receipts.company_id)
) with check (updated_by=auth.uid());

-- Enforce the live workflow at database level, not only in the browser.
create or replace function public.enforce_holiday_receipt_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare current_role text;
declare current_user_id uuid;
begin
  current_user_id := coalesce(auth.uid(), nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);
  select lower(coalesce(role,'')) into current_role from public.users where id=current_user_id;
  if current_role like '%finance%' then
    if new.status='acknowledged' and coalesce(old.status,'pending')='pending'
      and new.acknowledged_by=current_user_id and new.acknowledged_at is not null
      and new.voided_by is null and new.voided_at is null and coalesce(new.void_reason,'')='' then return new; end if;
    if new.status='void' and coalesce(old.status,'pending') in ('pending','acknowledged')
      and new.voided_by=current_user_id and new.voided_at is not null and nullif(trim(new.void_reason),'') is not null then return new; end if;
    raise exception 'Finance may only acknowledge or void a receipt';
  end if;
  if new.created_by=current_user_id and coalesce(old.status,'pending')='pending' and new.status='pending' then return new; end if;
  raise exception 'Only the GRO who created a pending receipt may edit it';
end; $$;
drop trigger if exists holiday_receipt_workflow on public.holiday_home_receipts;
create trigger holiday_receipt_workflow before update on public.holiday_home_receipts
for each row execute function public.enforce_holiday_receipt_workflow();
grant select,insert,update on public.holiday_home_receipts to authenticated;
grant execute on function public.next_holiday_home_receipt_number(uuid) to authenticated;

-- Allows authorised Holiday Home Receipt users to read only company-mapped properties.
drop policy if exists "Holiday receipt users view properties" on public.cheque_flow_properties;
create policy "Holiday receipt users view properties" on public.cheque_flow_properties for select to authenticated using (
  exists (select 1 from public.users where id=auth.uid() and (role in ('superadmin','finance','cfo','supervisor') or holiday_home_receipts_enabled))
);
