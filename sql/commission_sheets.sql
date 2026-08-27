-- Commission Sheets module. Run in Supabase SQL Editor after user_module_access.sql.
create extension if not exists pgcrypto;

create table if not exists public.user_module_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  module_key text not null,
  role_key text not null check (role_key in ('make', 'view', 'finance')),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key, role_key)
);
alter table public.user_module_roles enable row level security;
create policy "Users read their module roles" on public.user_module_roles for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.users where id = auth.uid() and role = 'superadmin'));
create policy "Superadmins manage module roles" on public.user_module_roles for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and role = 'superadmin'))
with check (exists (select 1 from public.users where id = auth.uid() and role = 'superadmin'));
grant select, insert, update, delete on public.user_module_roles to authenticated;

create table if not exists public.commission_sheets (
  id uuid primary key default gen_random_uuid(),
  form_ref text not null unique,
  company_id uuid not null references public.companies(id) on delete restrict,
  transaction_date date not null default current_date,
  client_name text not null, client_contact text,
  building_project text, developer text, unit_no text not null, unit_type text, bedrooms text,
  unit_value_aed numeric(14,2), agent_name text, agent_team text,
  deal_type text not null check (deal_type in ('rental','primary_offplan','buy_sell')),
  lead_source text, lead_source_other text,
  commission_pct numeric(8,4), gross_commission_aed numeric(14,2) not null check (gross_commission_aed > 0),
  vat_amount_aed numeric(14,2) not null default 0, total_payable_aed numeric(14,2) not null default 0,
  tracking_status text, invoice_no text, invoice_sent_date date, commission_received_date date,
  receive_mode text, amount_received_aed numeric(14,2), commission_paid_date date, payment_mode_paid text,
  calculated_amount_paid_aed numeric(14,2) not null default 0, finance_amount_paid_override_aed numeric(14,2),
  finance_override_reason text, paid_client_ext_date date, paid_client_ext_amount numeric(14,2),
  deductions_aed numeric(14,2) not null default 0, additional_payment_aed numeric(14,2) not null default 0,
  net_agent_payable_aed numeric(14,2) not null default 0, total_after_deduction_aed numeric(14,2) not null default 0,
  remarks text, prepared_by text, manager text, accounts text,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_by uuid references public.users(id)
);
create index if not exists commission_sheets_company_date_idx on public.commission_sheets(company_id, transaction_date desc);
create index if not exists commission_sheets_active_idx on public.commission_sheets(deleted_at) where deleted_at is null;

-- Finance-only fields are protected server-side as well as in the UI.
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
  elsif to_jsonb(new) - array['updated_at','updated_by','created_at','created_by','company_id','form_ref','transaction_date','client_name','client_contact','building_project','developer','unit_no','unit_type','bedrooms','unit_value_aed','agent_name','agent_team','deal_type','lead_source','lead_source_other','commission_pct','gross_commission_aed','vat_amount_aed','total_payable_aed','calculated_amount_paid_aed','net_agent_payable_aed','total_after_deduction_aed']
      is distinct from to_jsonb(old) - array['updated_at','updated_by','created_at','created_by','company_id','form_ref','transaction_date','client_name','client_contact','building_project','developer','unit_no','unit_type','bedrooms','unit_value_aed','agent_name','agent_team','deal_type','lead_source','lead_source_other','commission_pct','gross_commission_aed','vat_amount_aed','total_payable_aed','calculated_amount_paid_aed','net_agent_payable_aed','total_after_deduction_aed'] then
    raise exception 'Commission Sheet finance access required for accounts and approval fields';
  end if;
  return new;
end $$;
drop trigger if exists commission_sheets_guard_finance_fields on public.commission_sheets;
create trigger commission_sheets_guard_finance_fields before insert or update on public.commission_sheets
for each row execute function public.guard_commission_finance_fields();

create table if not exists public.commission_distribution_lines (
  id uuid primary key default gen_random_uuid(), commission_sheet_id uuid not null references public.commission_sheets(id) on delete cascade,
  line_kind text not null check (line_kind in ('team_leader_incentive','kickback_agent','kickback_client','residual')),
  sort_order integer not null default 0, party text, recipient_name text, pct_of_base numeric(8,4),
  payable_aed numeric(14,2) not null default 0, paid_aed numeric(14,2) not null default 0, payment_mode text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists commission_distribution_lines_sheet_idx on public.commission_distribution_lines(commission_sheet_id, sort_order);

create table if not exists public.commission_sheet_documents (
  id uuid primary key default gen_random_uuid(), commission_sheet_id uuid not null references public.commission_sheets(id) on delete cascade,
  document_code text not null, document_label text not null, is_selected boolean not null default false,
  other_description text, local_file_name text, local_folder_label text, created_at timestamptz not null default now(),
  unique(commission_sheet_id, document_code)
);

create or replace function public.commission_module_role_at_least(required_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and role = 'superadmin')
  or exists (select 1 from user_module_roles where user_id = auth.uid() and module_key = 'commission_sheets'
    and role_key = any(case required_role
      when 'finance' then array['finance']
      when 'make' then array['make','finance']
      else array['view','make','finance'] end)
  );
$$;

alter table public.commission_sheets enable row level security;
alter table public.commission_distribution_lines enable row level security;
alter table public.commission_sheet_documents enable row level security;

create policy "Commission viewers read sheets" on public.commission_sheets for select to authenticated using (public.commission_module_role_at_least('view'));
create policy "Commission makers insert sheets" on public.commission_sheets for insert to authenticated with check (created_by = auth.uid() and public.commission_module_role_at_least('make'));
create policy "Commission makers update sheets" on public.commission_sheets for update to authenticated using (public.commission_module_role_at_least('make')) with check (public.commission_module_role_at_least('make'));
create policy "Commission superadmins delete sheets" on public.commission_sheets for delete to authenticated using (exists (select 1 from public.users where id=auth.uid() and role='superadmin'));
create policy "Commission viewers read lines" on public.commission_distribution_lines for select to authenticated using (public.commission_module_role_at_least('view'));
create policy "Commission makers manage lines" on public.commission_distribution_lines for all to authenticated using (public.commission_module_role_at_least('make')) with check (public.commission_module_role_at_least('make'));
create policy "Commission viewers read documents" on public.commission_sheet_documents for select to authenticated using (public.commission_module_role_at_least('view'));
create policy "Commission makers manage documents" on public.commission_sheet_documents for all to authenticated using (public.commission_module_role_at_least('make')) with check (public.commission_module_role_at_least('make'));
grant select, insert, update, delete on public.commission_sheets, public.commission_distribution_lines, public.commission_sheet_documents to authenticated;

create or replace function public.next_commission_sheet_ref(p_company_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text; n integer; y text := to_char(current_date, 'YYYY');
begin
  if not public.commission_module_role_at_least('make') then raise exception 'Commission Sheet make access required'; end if;
  select upper(prefix) into p from companies where id = p_company_id;
  if p is null then raise exception 'Company not found'; end if;
  perform pg_advisory_xact_lock(hashtext(p || '-CS-' || y));
  select coalesce(max(nullif(substring(form_ref from '-([0-9]+)$'), '')::integer), 0) + 1 into n
  from commission_sheets where company_id = p_company_id and form_ref like p || '-CS-' || y || '-%';
  return p || '-CS-' || y || '-' || lpad(n::text, 3, '0');
end $$;
grant execute on function public.next_commission_sheet_ref(uuid) to authenticated;
