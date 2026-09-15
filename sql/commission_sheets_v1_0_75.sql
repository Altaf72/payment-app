-- Commission Input Sheet v1.0.75
-- Makes the finance-field guard resilient to new non-finance columns and blank text values.
-- Safe to run more than once.

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

notify pgrst, 'reload schema';
