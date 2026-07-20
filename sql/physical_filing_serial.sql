-- Physical Filing Serial Number (PFS)
-- Run this once in Supabase SQL editor before using maker-stage PFS assignment.

alter table public.applications
  add column if not exists pfs_folder text
    check (pfs_folder in ('cash', 'bank_non_cash')),
  add column if not exists pfs_no integer,
  add column if not exists pfs_display text,
  add column if not exists pfs_assigned_at timestamptz,
  add column if not exists pfs_assigned_by uuid references public.users(id);

create unique index if not exists applications_pfs_folder_no_key
  on public.applications (pfs_folder, pfs_no)
  where pfs_folder is not null and pfs_no is not null;

create index if not exists applications_pfs_display_idx
  on public.applications (pfs_display);

-- Shared PFS counters. These run in the database rather than in the browser,
-- so every application creator receives the next number even when RLS hides
-- other users' applications.
create sequence if not exists public.cash_pfs_no_seq start with 1;
create sequence if not exists public.bank_pfs_no_seq start with 1;

-- When applying this to an existing database, advance a new/recreated sequence
-- past numbers already used by applications. Never move a sequence backwards.
do $$
declare
  v_max_no bigint;
  v_last_no bigint;
  v_is_called boolean;
begin
  select coalesce(max(pfs_no), 0) into v_max_no
  from public.applications where pfs_folder = 'cash';
  select last_value, is_called into v_last_no, v_is_called
  from public.cash_pfs_no_seq;
  if v_max_no > v_last_no or (v_max_no = v_last_no and v_max_no > 0 and not v_is_called) then
    perform setval('public.cash_pfs_no_seq', v_max_no, true);
  end if;

  select coalesce(max(pfs_no), 0) into v_max_no
  from public.applications where pfs_folder = 'bank_non_cash';
  select last_value, is_called into v_last_no, v_is_called
  from public.bank_pfs_no_seq;
  if v_max_no > v_last_no or (v_max_no = v_last_no and v_max_no > 0 and not v_is_called) then
    perform setval('public.bank_pfs_no_seq', v_max_no, true);
  end if;
end;
$$;

create or replace function public.next_pfs_number(p_folder text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_folder = 'cash' then
    return nextval('public.cash_pfs_no_seq')::integer;
  elsif p_folder = 'bank_non_cash' then
    return nextval('public.bank_pfs_no_seq')::integer;
  end if;

  raise exception 'Invalid PFS folder: %', p_folder using errcode = '22023';
end;
$$;

revoke all on function public.next_pfs_number(text) from public;
grant execute on function public.next_pfs_number(text) to authenticated;

-- If your applications_full view explicitly lists columns instead of selecting a.*,
-- add these columns to that view too:
--   applications.pfs_folder,
--   applications.pfs_no,
--   applications.pfs_display,
--   applications.pfs_assigned_at,
--   applications.pfs_assigned_by
