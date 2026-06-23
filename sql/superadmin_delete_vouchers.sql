-- Allow only Super Admin users to permanently delete test vouchers.
-- Run once in the Supabase SQL Editor.

drop policy if exists "Super admins can delete payment vouchers"
  on public.payment_vouchers;

create policy "Super admins can delete payment vouchers"
on public.payment_vouchers for delete
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role = 'superadmin'
  )
);

grant delete on public.payment_vouchers to authenticated;
