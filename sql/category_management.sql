-- Category suggestions can be removed by finance and system administrators.
-- Applications store their own category text and are not updated by this policy.
grant delete on public.payment_reasons to authenticated;

drop policy if exists "Finance and super admins can delete categories" on public.payment_reasons;
create policy "Finance and super admins can delete categories"
on public.payment_reasons for delete to authenticated
using (exists (select 1 from public.users where users.id = auth.uid() and users.role in ('finance', 'superadmin')));
