-- Commission Input Sheet v1.0.73
-- Repairs missing developer BDM columns and refreshes the Supabase API schema cache.
-- Safe to run more than once.

alter table public.commission_sheets
  add column if not exists developer_bdm_name text,
  add column if not exists developer_bdm_email text,
  add column if not exists developer_bdm_contact text;

create index if not exists commission_sheets_developer_bdm_idx
  on public.commission_sheets (lower(developer), lower(developer_bdm_name))
  where developer_bdm_name is not null and deleted_at is null;

comment on column public.commission_sheets.developer_bdm_name
  is 'Developer business development manager name captured for this deal.';
comment on column public.commission_sheets.developer_bdm_email
  is 'Developer BDM email captured for this deal.';
comment on column public.commission_sheets.developer_bdm_contact
  is 'Developer BDM contact number captured for this deal.';

notify pgrst, 'reload schema';
