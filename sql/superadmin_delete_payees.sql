-- Allow Super Admin to clean incorrect receiving company / payee suggestions.
-- Existing applications keep their stored payee text; this only removes the suggestion row.

grant delete on public.payees to authenticated;

drop policy if exists "Super admins can delete payees" on public.payees;
create policy "Super admins can delete payees"
on public.payees
for delete
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.role = 'superadmin'
  )
);
