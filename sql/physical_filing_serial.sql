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

-- If your applications_full view explicitly lists columns instead of selecting a.*,
-- add these columns to that view too:
--   applications.pfs_folder,
--   applications.pfs_no,
--   applications.pfs_display,
--   applications.pfs_assigned_at,
--   applications.pfs_assigned_by
