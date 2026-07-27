-- Explicit per-user module access. Run once in Supabase SQL Editor.
create table if not exists public.user_module_access (
  user_id uuid not null references public.users(id) on delete cascade,
  module_key text not null,
  granted boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key)
);
alter table public.user_module_access enable row level security;
drop policy if exists "Users can read their module access" on public.user_module_access;
create policy "Users can read their module access" on public.user_module_access for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.users where id=auth.uid() and role='superadmin'));
drop policy if exists "Super admins manage module access" on public.user_module_access;
create policy "Super admins manage module access" on public.user_module_access for all to authenticated
using (exists (select 1 from public.users where id=auth.uid() and role='superadmin'))
with check (exists (select 1 from public.users where id=auth.uid() and role='superadmin'));
grant select, insert, update, delete on public.user_module_access to authenticated;
