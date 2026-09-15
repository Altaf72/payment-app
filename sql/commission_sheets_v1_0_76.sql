-- Commission Input Sheet v1.0.76
-- Reasserts the complete Make/View/Finance access needed by the safer edit workflow.
-- Safe to run more than once.

alter table public.commission_sheets
  add column if not exists developer_bdm_name text,
  add column if not exists developer_bdm_email text,
  add column if not exists developer_bdm_contact text;

create or replace function public.guard_commission_finance_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.commission_module_role_at_least('finance') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(btrim(new.tracking_status), '') is not null
      or nullif(btrim(new.invoice_no), '') is not null
      or new.invoice_sent_date is not null
      or new.commission_received_date is not null
      or nullif(btrim(new.receive_mode), '') is not null
      or coalesce(new.amount_received_aed, 0) <> 0
      or new.commission_paid_date is not null
      or nullif(btrim(new.payment_mode_paid), '') is not null
      or new.finance_amount_paid_override_aed is not null
      or nullif(btrim(new.finance_override_reason), '') is not null
      or new.paid_client_ext_date is not null
      or new.paid_client_ext_amount is not null
      or coalesce(new.deductions_aed, 0) <> 0
      or coalesce(new.additional_payment_aed, 0) <> 0
      or nullif(btrim(new.remarks), '') is not null
      or nullif(btrim(new.prepared_by), '') is not null
      or nullif(btrim(new.manager), '') is not null
      or nullif(btrim(new.accounts), '') is not null then
      raise exception 'Commission Sheet finance access required for accounts and approval fields';
    end if;
  elsif
    nullif(btrim(new.tracking_status), '') is distinct from nullif(btrim(old.tracking_status), '')
    or nullif(btrim(new.invoice_no), '') is distinct from nullif(btrim(old.invoice_no), '')
    or new.invoice_sent_date is distinct from old.invoice_sent_date
    or new.commission_received_date is distinct from old.commission_received_date
    or nullif(btrim(new.receive_mode), '') is distinct from nullif(btrim(old.receive_mode), '')
    or new.amount_received_aed is distinct from old.amount_received_aed
    or new.commission_paid_date is distinct from old.commission_paid_date
    or nullif(btrim(new.payment_mode_paid), '') is distinct from nullif(btrim(old.payment_mode_paid), '')
    or new.finance_amount_paid_override_aed is distinct from old.finance_amount_paid_override_aed
    or nullif(btrim(new.finance_override_reason), '') is distinct from nullif(btrim(old.finance_override_reason), '')
    or new.paid_client_ext_date is distinct from old.paid_client_ext_date
    or new.paid_client_ext_amount is distinct from old.paid_client_ext_amount
    or new.deductions_aed is distinct from old.deductions_aed
    or new.additional_payment_aed is distinct from old.additional_payment_aed
    or nullif(btrim(new.remarks), '') is distinct from nullif(btrim(old.remarks), '')
    or nullif(btrim(new.prepared_by), '') is distinct from nullif(btrim(old.prepared_by), '')
    or nullif(btrim(new.manager), '') is distinct from nullif(btrim(old.manager), '')
    or nullif(btrim(new.accounts), '') is distinct from nullif(btrim(old.accounts), '') then
    raise exception 'Commission Sheet finance access required for accounts and approval fields';
  end if;

  return new;
end
$$;

alter table public.commission_sheets enable row level security;
alter table public.commission_distribution_lines enable row level security;
alter table public.commission_distribution_payments enable row level security;
alter table public.commission_sheet_documents enable row level security;
alter table public.commission_receipts enable row level security;

grant select, insert, update, delete on
  public.commission_sheets,
  public.commission_distribution_lines,
  public.commission_distribution_payments,
  public.commission_sheet_documents,
  public.commission_receipts
to authenticated;

drop policy if exists "Commission viewers read sheets" on public.commission_sheets;
create policy "Commission viewers read sheets"
  on public.commission_sheets for select to authenticated
  using (public.commission_module_role_at_least('view'));

drop policy if exists "Commission makers insert sheets" on public.commission_sheets;
create policy "Commission makers insert sheets"
  on public.commission_sheets for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.commission_module_role_at_least('make')
  );

drop policy if exists "Commission makers update sheets" on public.commission_sheets;
create policy "Commission makers update sheets"
  on public.commission_sheets for update to authenticated
  using (public.commission_module_role_at_least('make'))
  with check (public.commission_module_role_at_least('make'));

drop policy if exists "Commission viewers read lines" on public.commission_distribution_lines;
create policy "Commission viewers read lines"
  on public.commission_distribution_lines for select to authenticated
  using (public.commission_module_role_at_least('view'));

drop policy if exists "Commission makers manage lines" on public.commission_distribution_lines;
create policy "Commission makers manage lines"
  on public.commission_distribution_lines for all to authenticated
  using (public.commission_module_role_at_least('make'))
  with check (public.commission_module_role_at_least('make'));

drop policy if exists "Commission users read allocation payments" on public.commission_distribution_payments;
create policy "Commission users read allocation payments"
  on public.commission_distribution_payments for select to authenticated
  using (public.commission_module_role_at_least('view'));

drop policy if exists "Commission makers manage allocation payments" on public.commission_distribution_payments;
create policy "Commission makers manage allocation payments"
  on public.commission_distribution_payments for all to authenticated
  using (public.commission_module_role_at_least('make'))
  with check (public.commission_module_role_at_least('make'));

drop policy if exists "Commission viewers read documents" on public.commission_sheet_documents;
create policy "Commission viewers read documents"
  on public.commission_sheet_documents for select to authenticated
  using (public.commission_module_role_at_least('view'));

drop policy if exists "Commission makers manage documents" on public.commission_sheet_documents;
create policy "Commission makers manage documents"
  on public.commission_sheet_documents for all to authenticated
  using (public.commission_module_role_at_least('make'))
  with check (public.commission_module_role_at_least('make'));

drop policy if exists "Commission users read receipts" on public.commission_receipts;
create policy "Commission users read receipts"
  on public.commission_receipts for select to authenticated
  using (public.commission_module_role_at_least('view'));

drop policy if exists "Commission finance manages receipts" on public.commission_receipts;
create policy "Commission finance manages receipts"
  on public.commission_receipts for all to authenticated
  using (public.commission_module_role_at_least('finance'))
  with check (public.commission_module_role_at_least('finance'));

notify pgrst, 'reload schema';
