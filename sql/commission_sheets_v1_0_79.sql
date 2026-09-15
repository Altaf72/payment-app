-- Commission Input Sheet v1.0.79
-- Adds a Staff-authored transaction remark visible to Finance and print output.
-- Safe to run more than once.

alter table public.commission_sheets
  add column if not exists staff_remarks text;

comment on column public.commission_sheets.staff_remarks
  is 'Deal context or explanation entered by a Commission Sheet maker and visible to Finance.';

notify pgrst, 'reload schema';
