-- Commission Input Sheet v1.0.52. Run after the earlier Commission Sheets migrations.
alter table public.commission_sheets add column if not exists client_id_number text;
alter table public.commission_sheets add column if not exists client_id_expiry date;
