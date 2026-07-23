-- Store a print-safe copy of each company logo. Run once in Supabase SQL Editor.
alter table public.companies
  add column if not exists logo_data_url text;
