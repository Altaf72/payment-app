-- Run once in Supabase SQL Editor: Super Admin full edit rights + audit trail.
create table if not exists public.holiday_home_receipt_audit_log (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.holiday_home_receipts(id) on delete cascade,
  action text not null,
  changed_by uuid references public.users(id),
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb
);
create index if not exists holiday_home_receipt_audit_receipt_idx on public.holiday_home_receipt_audit_log(receipt_id, changed_at desc);
alter table public.holiday_home_receipt_audit_log enable row level security;
drop policy if exists "Super Admin views HHR audit" on public.holiday_home_receipt_audit_log;
create policy "Super Admin views HHR audit" on public.holiday_home_receipt_audit_log for select to authenticated using (
  exists (select 1 from public.users where id=auth.uid() and lower(coalesce(role,''))='superadmin')
);

create or replace function public.audit_holiday_home_receipt_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor_id uuid;
begin
  actor_id := coalesce(auth.uid(), nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);
  insert into public.holiday_home_receipt_audit_log(receipt_id, action, changed_by, before_data, after_data)
  values (new.id, case when old.status is distinct from new.status then upper(coalesce(new.status, 'pending')) else 'EDIT' end, actor_id, to_jsonb(old), to_jsonb(new));
  return new;
end; $$;
drop trigger if exists holiday_home_receipt_audit on public.holiday_home_receipts;
create trigger holiday_home_receipt_audit after update on public.holiday_home_receipts
for each row execute function public.audit_holiday_home_receipt_change();

drop policy if exists "Holiday receipt update" on public.holiday_home_receipts;
create policy "Holiday receipt update" on public.holiday_home_receipts for update to authenticated using (
  created_by=auth.uid()
  or exists (select 1 from public.users where id=auth.uid() and lower(coalesce(role,'')) like '%finance%')
  or exists (select 1 from public.users where id=auth.uid() and lower(coalesce(role,''))='superadmin')
) with check (updated_by=auth.uid());

create or replace function public.enforce_holiday_receipt_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare current_role text; current_user_id uuid;
begin
  if current_setting('app.hhr_finance_action', true) in ('acknowledge', 'void') then return new; end if;
  current_user_id := coalesce(auth.uid(), nullif(current_setting('request.jwt.claim.sub', true), '')::uuid, new.updated_by);
  select lower(coalesce(role,'')) into current_role from public.users where id=current_user_id;
  if current_role='superadmin' then return new; end if;
  if current_role like '%finance%' then
    if new.status='acknowledged' and coalesce(old.status,'pending')='pending' and new.acknowledged_by=current_user_id and new.acknowledged_at is not null then return new; end if;
    if new.status='void' and coalesce(old.status,'pending') in ('pending','acknowledged') and new.voided_by=current_user_id and new.voided_at is not null and nullif(trim(new.void_reason),'') is not null then return new; end if;
    raise exception 'Finance may only acknowledge or void a receipt';
  end if;
  if new.created_by=current_user_id and coalesce(old.status,'pending')='pending' and new.status='pending' then return new; end if;
  raise exception 'Only the GRO who created a pending receipt may edit it';
end; $$;
