-- HHR receipt-number hotfix: run once in Supabase SQL Editor.
-- Numbers are allocated inside the insert transaction, never from a browser cache.

create table if not exists public.holiday_home_receipt_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.assign_holiday_home_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  company_prefix text;
  next_number integer;
begin
  -- Receipt numbers are immutable after creation.
  if tg_op = 'UPDATE' then
    new.receipt_number := old.receipt_number;
    return new;
  end if;

  if not exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and company_id = new.company_id
  ) then
    raise exception 'Company access denied';
  end if;

  -- Serialise numbering for this company, including first-time counter setup.
  perform pg_advisory_xact_lock(hashtext(new.company_id::text));

  select upper(prefix) into company_prefix
  from public.companies
  where id = new.company_id;

  if company_prefix is null or company_prefix = '' then
    raise exception 'Company prefix is required for receipt numbering';
  end if;

  insert into public.holiday_home_receipt_counters(company_id, last_number)
  values (
    new.company_id,
    coalesce((
      select max((substring(receipt_number from ('^' || company_prefix || 'R-([0-9]+)$'))::integer))
      from public.holiday_home_receipts
      where company_id = new.company_id
    ), 0)
  )
  on conflict (company_id) do nothing;

  update public.holiday_home_receipt_counters
  set last_number = last_number + 1,
      updated_at = now()
  where company_id = new.company_id
  returning last_number into next_number;

  new.receipt_number := company_prefix || 'R-' || lpad(next_number::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists holiday_receipt_number_assignment on public.holiday_home_receipts;
create trigger holiday_receipt_number_assignment
before insert or update on public.holiday_home_receipts
for each row execute function public.assign_holiday_home_receipt_number();

grant select on public.holiday_home_receipt_counters to authenticated;
