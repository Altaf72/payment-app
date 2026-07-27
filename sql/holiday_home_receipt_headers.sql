-- Per-company printable Holiday Home Receipt header image.
alter table public.companies
  add column if not exists holiday_receipt_header_url text;
