-- Commission Input Sheet v1.0.71: developer BDM details and maker-field protection.
-- Run after the existing Commission Sheets migrations.

alter table public.commission_sheets
  add column if not exists developer_bdm_name text,
  add column if not exists developer_bdm_email text,
  add column if not exists developer_bdm_contact text;

create index if not exists commission_sheets_developer_bdm_idx
  on public.commission_sheets (lower(developer), lower(developer_bdm_name))
  where developer_bdm_name is not null and deleted_at is null;

create or replace function public.guard_commission_finance_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.commission_module_role_at_least('finance') then return new; end if;
  if tg_op = 'INSERT' then
    if new.tracking_status is not null or new.invoice_no is not null or new.invoice_sent_date is not null
      or new.commission_received_date is not null or new.receive_mode is not null or new.amount_received_aed is not null
      or new.commission_paid_date is not null or new.payment_mode_paid is not null or new.finance_amount_paid_override_aed is not null
      or new.finance_override_reason is not null or new.paid_client_ext_date is not null or new.paid_client_ext_amount is not null
      or new.deductions_aed <> 0 or new.additional_payment_aed <> 0 or new.remarks is not null
      or new.prepared_by is not null or new.manager is not null or new.accounts is not null then
      raise exception 'Commission Sheet finance access required for accounts and approval fields';
    end if;
  elsif to_jsonb(new) - array[
      'updated_at','updated_by','created_at','created_by','company_id','form_ref','transaction_date',
      'client_name','client_contact','client_id_number','client_id_expiry','building_project','developer',
      'developer_bdm_name','developer_bdm_email','developer_bdm_contact','unit_no','unit_type','bedrooms',
      'unit_value_aed','agent_name','agent_team','deal_type','lead_source','lead_source_other','commission_pct',
      'gross_commission_aed','vat_amount_aed','total_payable_aed','calculated_amount_paid_aed',
      'net_agent_payable_aed','total_after_deduction_aed'
    ] is distinct from to_jsonb(old) - array[
      'updated_at','updated_by','created_at','created_by','company_id','form_ref','transaction_date',
      'client_name','client_contact','client_id_number','client_id_expiry','building_project','developer',
      'developer_bdm_name','developer_bdm_email','developer_bdm_contact','unit_no','unit_type','bedrooms',
      'unit_value_aed','agent_name','agent_team','deal_type','lead_source','lead_source_other','commission_pct',
      'gross_commission_aed','vat_amount_aed','total_payable_aed','calculated_amount_paid_aed',
      'net_agent_payable_aed','total_after_deduction_aed'
    ] then
    raise exception 'Commission Sheet finance access required for accounts and approval fields';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
