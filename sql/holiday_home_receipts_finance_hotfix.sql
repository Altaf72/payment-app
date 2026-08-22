-- Run this immediately in Supabase SQL Editor to authorise Finance
-- acknowledgement and void actions on Holiday Home Receipts.

update public.holiday_home_receipts
set status = 'pending'
where status is null;

drop policy if exists "Holiday receipt update" on public.holiday_home_receipts;
create policy "Holiday receipt update" on public.holiday_home_receipts for update to authenticated using (
  (
    created_by = auth.uid()
    or exists (
      select 1 from public.users
      where id = auth.uid() and lower(coalesce(role, '')) = 'finance'
    )
  )
  and exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and company_id = holiday_home_receipts.company_id
  )
) with check (updated_by = auth.uid());

create or replace function public.enforce_holiday_receipt_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
declare current_role text;
begin
  select lower(coalesce(role, '')) into current_role
  from public.users where id = auth.uid();

  if current_role = 'finance' then
    if new.status = 'acknowledged' and coalesce(old.status, 'pending') = 'pending'
      and new.acknowledged_by = auth.uid() and new.acknowledged_at is not null
      and new.voided_by is null and new.voided_at is null and coalesce(new.void_reason, '') = ''
      and (to_jsonb(new) - array['status','acknowledged_by','acknowledged_at','updated_by','updated_at']) =
          (to_jsonb(old) - array['status','acknowledged_by','acknowledged_at','updated_by','updated_at']) then
      return new;
    end if;

    if new.status = 'void' and coalesce(old.status, 'pending') in ('pending','acknowledged')
      and new.voided_by = auth.uid() and new.voided_at is not null
      and nullif(trim(new.void_reason), '') is not null
      and (to_jsonb(new) - array['status','voided_by','voided_at','void_reason','updated_by','updated_at']) =
          (to_jsonb(old) - array['status','voided_by','voided_at','void_reason','updated_by','updated_at']) then
      return new;
    end if;

    raise exception 'Finance may only acknowledge or void a receipt';
  end if;

  if new.created_by = auth.uid()
    and coalesce(old.status, 'pending') = 'pending'
    and new.status = 'pending' then
    return new;
  end if;

  raise exception 'Only the GRO who created a pending receipt may edit it';
end; $$;

drop trigger if exists holiday_receipt_workflow on public.holiday_home_receipts;
create trigger holiday_receipt_workflow
before update on public.holiday_home_receipts
for each row execute function public.enforce_holiday_receipt_workflow();
