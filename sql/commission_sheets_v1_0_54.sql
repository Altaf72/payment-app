-- Commission Input Sheet redesign support. Run after v1.0.52.
alter table public.commission_distribution_lines add column if not exists type_label text;
alter table public.commission_distribution_lines add column if not exists notes text;
