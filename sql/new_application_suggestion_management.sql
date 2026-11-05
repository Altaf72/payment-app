-- Allow Finance to remove New Application suggestions without deleting
-- historical values referenced by existing applications.
grant update on public.payment_reasons to authenticated;
grant update on public.payment_methods to authenticated;
grant update on public.banks to authenticated;
alter table public.payees add column if not exists active boolean not null default true;

drop policy if exists "Finance manages category suggestions" on public.payment_reasons;
create policy "Finance manages category suggestions" on public.payment_reasons
for update to authenticated
using (exists (select 1 from public.users where users.id = auth.uid() and users.role in ('finance','superadmin')))
with check (exists (select 1 from public.users where users.id = auth.uid() and users.role in ('finance','superadmin')));

drop policy if exists "Finance manages payment method suggestions" on public.payment_methods;
create policy "Finance manages payment method suggestions" on public.payment_methods
for update to authenticated
using (exists (select 1 from public.users where users.id = auth.uid() and users.role in ('finance','superadmin')))
with check (exists (select 1 from public.users where users.id = auth.uid() and users.role in ('finance','superadmin')));

drop policy if exists "Finance manages bank suggestions" on public.banks;
create policy "Finance manages bank suggestions" on public.banks
for update to authenticated
using (exists (select 1 from public.users where users.id = auth.uid() and users.role in ('finance','superadmin')))
with check (exists (select 1 from public.users where users.id = auth.uid() and users.role in ('finance','superadmin')));

-- Some installations have read policies that expose only active rows. Such a
-- policy can reject the post-update row when active changes to false. Keep the
-- operation narrow and perform it through this role-checked function instead.
create or replace function public.archive_application_suggestion(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.users where id = auth.uid();
  if v_role not in ('finance','superadmin') then
    raise exception 'Only Finance or System Administrator can remove suggestions';
  end if;

  case p_table
    when 'payment_reasons' then
      update public.payment_reasons set active = false where id = p_id;
    when 'payment_methods' then
      update public.payment_methods set active = false where id = p_id;
    when 'banks' then
      update public.banks set active = false where id = p_id;
    when 'payees' then
      update public.payees set active = false where id = p_id;
    else
      raise exception 'Unsupported suggestion table';
  end case;
end;
$$;

revoke all on function public.archive_application_suggestion(text, uuid) from public;
grant execute on function public.archive_application_suggestion(text, uuid) to authenticated;
