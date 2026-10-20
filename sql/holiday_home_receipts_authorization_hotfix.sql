-- Run in Supabase SQL Editor now.
-- Restores Super Admin unrestricted Holiday Home Receipt editing.

drop policy if exists "Holiday receipt update" on public.holiday_home_receipts;
create policy "Holiday receipt update" on public.holiday_home_receipts for update to authenticated using (
  created_by = auth.uid()
  or exists (select 1 from public.users where id = auth.uid() and lower(coalesce(role,'')) like '%finance%')
  or exists (select 1 from public.users where id = auth.uid() and regexp_replace(lower(coalesce(role,'')), '[^a-z]', '', 'g') = 'superadmin')
) with check (updated_by = auth.uid());

create or replace function public.enforce_holiday_receipt_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare current_role text;
declare current_user_id uuid;
begin
  -- updated_by is written by the authenticated application on every save.
  -- Check Super Admin from that editor identity before request-context fallback.
  if exists (
    select 1 from public.users
    where id = new.updated_by
      and regexp_replace(lower(coalesce(role,'')), '[^a-z]', '', 'g') = 'superadmin'
  ) then return new; end if;

  -- Some hosted requests do not expose auth.uid() inside a trigger. The app
  -- always supplies updated_by; use it as the final identity fallback.
  current_user_id := coalesce(auth.uid(), nullif(current_setting('request.jwt.claim.sub', true), '')::uuid, new.updated_by);
  select regexp_replace(lower(coalesce(role,'')), '[^a-z]', '', 'g') into current_role from public.users where id=current_user_id;

  -- Super Admin has full edit authority, including acknowledged and void receipts.
  if current_role = 'superadmin' then return new; end if;

  if current_setting('app.hhr_finance_action', true) in ('acknowledge', 'void') then return new; end if;

  if current_role like '%finance%' then
    if new.status='acknowledged' and coalesce(old.status,'pending')='pending' then return new; end if;
    if new.status='void' and coalesce(old.status,'pending') in ('pending','acknowledged') and nullif(trim(new.void_reason),'') is not null then return new; end if;
    raise exception 'Finance may only acknowledge or void a receipt';
  end if;

  if new.created_by=current_user_id and coalesce(old.status,'pending')='pending' and new.status='pending' then return new; end if;
  raise exception 'Only the GRO who created a pending receipt may edit it';
end; $$;

drop trigger if exists holiday_receipt_workflow on public.holiday_home_receipts;
create trigger holiday_receipt_workflow before update on public.holiday_home_receipts
for each row execute function public.enforce_holiday_receipt_workflow();
