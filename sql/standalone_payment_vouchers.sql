-- Enable payment vouchers that are not linked to a payment application.
-- Run once in the Supabase SQL Editor.

alter table public.payment_vouchers
  alter column application_id drop not null;
