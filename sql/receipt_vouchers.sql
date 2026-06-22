-- Add Receipt Voucher support to the shared voucher module.
-- Run once in the Supabase SQL Editor.

alter table public.payment_vouchers
  alter column application_id drop not null;

alter table public.payment_vouchers
  add column if not exists voucher_type text not null default 'payment';

alter table public.payment_vouchers
  drop constraint if exists payment_vouchers_voucher_type_check;

alter table public.payment_vouchers
  add constraint payment_vouchers_voucher_type_check
  check (voucher_type in ('payment', 'receipt'));

create index if not exists payment_vouchers_type_company_idx
  on public.payment_vouchers(voucher_type, company_id);
