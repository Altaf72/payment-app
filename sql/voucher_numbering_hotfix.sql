-- Voucher-number hotfix: run once in Supabase SQL Editor.
-- Allocates all Payment Voucher and Receipt Voucher numbers inside the insert
-- transaction. Browser caches and concurrent users cannot create duplicates.

create table if not exists public.payment_voucher_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  voucher_type text not null check (voucher_type in ('payment', 'receipt')),
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, voucher_type)
);

create or replace function public.assign_payment_voucher_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  company_prefix text;
  application_ref text;
  voucher_code text;
  next_number integer;
begin
  -- Voucher identity never changes after it has been created.
  if tg_op = 'UPDATE' then
    new.voucher_number := old.voucher_number;
    new.installment_no := old.installment_no;
    return new;
  end if;

  select upper(prefix) into company_prefix
  from public.companies
  where id = new.company_id;
  if company_prefix is null or company_prefix = '' then
    raise exception 'Company prefix is required for voucher numbering';
  end if;

  voucher_code := case when new.voucher_type = 'receipt' then 'RV' else 'PV' end;

  if new.application_id is not null then
    -- Payment-application vouchers use the application number plus an
    -- installment suffix. Lock by application so two submissions cannot
    -- receive the same installment.
    perform pg_advisory_xact_lock(hashtext(new.application_id::text));
    select ref_number into application_ref from public.applications where id = new.application_id;
    if application_ref is null then raise exception 'Payment application not found'; end if;

    select coalesce(max(installment_no), 0) + 1 into next_number
    from public.payment_vouchers where application_id = new.application_id;

    new.installment_no := next_number;
    new.voucher_number := company_prefix || 'PV-' ||
      coalesce(substring(application_ref from '([0-9]+)(?!.*[0-9])'), nullif(regexp_replace(application_ref, '[^a-zA-Z0-9]', '', 'g'), ''), '0000') ||
      case when next_number = 1 then '' else '-' || lpad(next_number::text, 2, '0') end;
    return new;
  end if;

  -- Standalone PV and RV counters are separate and continue per company.
  perform pg_advisory_xact_lock(hashtext(new.company_id::text || ':' || new.voucher_type));
  insert into public.payment_voucher_counters(company_id, voucher_type, last_number)
  values (
    new.company_id,
    new.voucher_type,
    coalesce((
      select max((substring(voucher_number from ('^' || company_prefix || voucher_code || '-([0-9]+)$'))::integer))
      from public.payment_vouchers
      where company_id = new.company_id
        and application_id is null
        and voucher_type = new.voucher_type
    ), 0)
  ) on conflict (company_id, voucher_type) do nothing;

  update public.payment_voucher_counters
  set last_number = last_number + 1, updated_at = now()
  where company_id = new.company_id and voucher_type = new.voucher_type
  returning last_number into next_number;

  new.installment_no := 1;
  new.voucher_number := company_prefix || voucher_code || '-' || lpad(next_number::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists payment_voucher_number_assignment on public.payment_vouchers;
create trigger payment_voucher_number_assignment
before insert or update on public.payment_vouchers
for each row execute function public.assign_payment_voucher_number();

grant select on public.payment_voucher_counters to authenticated;
