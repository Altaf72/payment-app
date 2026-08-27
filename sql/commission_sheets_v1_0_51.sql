-- Commission Input Sheet v1.0.51 extension. Run AFTER commission_sheets.sql.
create table if not exists public.commission_document_templates (
  id uuid primary key default gen_random_uuid(), deal_type text not null check (deal_type in ('rental','primary_offplan','buy_sell')),
  document_code text not null, document_label text not null, is_required boolean not null default false,
  sort_order integer not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(deal_type, document_code)
);
create table if not exists public.commission_distribution_options (
  id uuid primary key default gen_random_uuid(), option_kind text not null check (option_kind in ('type','party')),
  label text not null, sort_order integer not null default 0, active boolean not null default true, unique(option_kind, label)
);
create table if not exists public.commission_distribution_payments (
  id uuid primary key default gen_random_uuid(), distribution_line_id uuid not null references public.commission_distribution_lines(id) on delete cascade,
  payment_date date not null, amount_aed numeric(14,2) not null check (amount_aed > 0), payment_mode text, instrument_no text, notes text,
  created_by uuid references public.users(id), created_at timestamptz not null default now()
);
create table if not exists public.commission_receipts (
  id uuid primary key default gen_random_uuid(), commission_sheet_id uuid not null references public.commission_sheets(id) on delete cascade,
  received_date date not null, amount_aed numeric(14,2) not null check (amount_aed > 0), receive_mode text, instrument_no text, remarks text,
  created_by uuid references public.users(id), created_at timestamptz not null default now()
);
create index if not exists commission_distribution_payments_line_idx on public.commission_distribution_payments(distribution_line_id, payment_date);
create index if not exists commission_receipts_sheet_idx on public.commission_receipts(commission_sheet_id, received_date);
insert into public.commission_document_templates(deal_type, document_code, document_label, is_required, sort_order) values
  ('primary_offplan','booking_doc','Initial sale contract / booking document',false,1),('primary_offplan','eid','Buyer + seller Emirates ID',false,2),('primary_offplan','passport','Buyer + seller passport',false,3),('primary_offplan','kyc','KYC',false,4),
  ('buy_sell','title_deed','Title deed / initial contract',false,1),('buy_sell','contract_f','Contract F (MOU)',false,2),('buy_sell','eid','Buyer + seller Emirates ID',false,3),('buy_sell','passport','Buyer + seller passport',false,4),
  ('rental','title_deed','Title deed',false,1),('rental','tenancy_contract','Tenancy contract',false,2),('rental','eid','Client Emirates ID',false,3),('rental','passport','Client passport',false,4)
on conflict (deal_type, document_code) do nothing;
insert into public.commission_distribution_options(option_kind,label,sort_order) values
  ('type','Team Leader Incentive',1),('type','Kickback to Agent',2),('type','Kickback to Client',3),('type','Residual Allocation',4),
  ('party','Company Share',1),('party','Agent',2),('party','Team Leader',3),('party','External Agent',4),('party','Client',5),('party','Other',6)
on conflict (option_kind,label) do nothing;
alter table public.commission_document_templates enable row level security;
alter table public.commission_distribution_options enable row level security;
alter table public.commission_distribution_payments enable row level security;
alter table public.commission_receipts enable row level security;
drop policy if exists "Commission users read document templates" on public.commission_document_templates;
create policy "Commission users read document templates" on public.commission_document_templates for select to authenticated using (public.commission_module_role_at_least('view'));
drop policy if exists "Superadmins manage document templates" on public.commission_document_templates;
create policy "Superadmins manage document templates" on public.commission_document_templates for all to authenticated using (exists (select 1 from public.users where id=auth.uid() and role='superadmin')) with check (exists (select 1 from public.users where id=auth.uid() and role='superadmin'));
drop policy if exists "Commission users read distribution options" on public.commission_distribution_options;
create policy "Commission users read distribution options" on public.commission_distribution_options for select to authenticated using (public.commission_module_role_at_least('view'));
drop policy if exists "Superadmins manage distribution options" on public.commission_distribution_options;
create policy "Superadmins manage distribution options" on public.commission_distribution_options for all to authenticated using (exists (select 1 from public.users where id=auth.uid() and role='superadmin')) with check (exists (select 1 from public.users where id=auth.uid() and role='superadmin'));
drop policy if exists "Commission users read allocation payments" on public.commission_distribution_payments;
create policy "Commission users read allocation payments" on public.commission_distribution_payments for select to authenticated using (public.commission_module_role_at_least('view'));
drop policy if exists "Commission makers manage allocation payments" on public.commission_distribution_payments;
create policy "Commission makers manage allocation payments" on public.commission_distribution_payments for all to authenticated using (public.commission_module_role_at_least('make')) with check (public.commission_module_role_at_least('make'));
drop policy if exists "Commission users read receipts" on public.commission_receipts;
create policy "Commission users read receipts" on public.commission_receipts for select to authenticated using (public.commission_module_role_at_least('view'));
drop policy if exists "Commission finance manages receipts" on public.commission_receipts;
create policy "Commission finance manages receipts" on public.commission_receipts for all to authenticated using (public.commission_module_role_at_least('finance')) with check (public.commission_module_role_at_least('finance'));
grant select, insert, update, delete on public.commission_document_templates, public.commission_distribution_options, public.commission_distribution_payments, public.commission_receipts to authenticated;
