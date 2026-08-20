-- Supervisor oversight and Finance-managed application classes.
-- Run once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('staff','supervisor','gro','manager','finance','ceo','cfo','superadmin'));

alter table public.applications add column if not exists class_name text;
create index if not exists applications_class_name_idx on public.applications (class_name);

create table if not exists public.staff_supervisors (
  staff_id uuid not null references public.users(id) on delete cascade,
  supervisor_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, supervisor_id),
  check (staff_id <> supervisor_id)
);

alter table public.staff_supervisors enable row level security;
drop policy if exists "Admins manage supervisor assignments" on public.staff_supervisors;
create policy "Admins manage supervisor assignments" on public.staff_supervisors for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and role = 'superadmin'))
with check (exists (select 1 from public.users where id = auth.uid() and role = 'superadmin'));
drop policy if exists "Supervisors read their assignments" on public.staff_supervisors;
create policy "Supervisors read their assignments" on public.staff_supervisors for select to authenticated
using (supervisor_id = auth.uid() or staff_id = auth.uid());
grant select, insert, delete on public.staff_supervisors to authenticated;

create table if not exists public.application_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

alter table public.application_classes enable row level security;
drop policy if exists "Authenticated users read application classes" on public.application_classes;
create policy "Authenticated users read application classes" on public.application_classes for select to authenticated using (true);
drop policy if exists "Finance manages application classes" on public.application_classes;
create policy "Finance manages application classes" on public.application_classes for all to authenticated
using (exists (select 1 from public.users where id = auth.uid() and role in ('finance','superadmin')))
with check (exists (select 1 from public.users where id = auth.uid() and role in ('finance','superadmin')));
grant select, insert, update, delete on public.application_classes to authenticated;

-- Read-only access to applications submitted by staff assigned to the supervisor.
drop policy if exists "Supervisors view assigned staff applications" on public.applications;
create policy "Supervisors view assigned staff applications" on public.applications for select to authenticated
using (
  exists (
    select 1 from public.staff_supervisors
    where staff_supervisors.staff_id = applications.submitted_by
      and staff_supervisors.supervisor_id = auth.uid()
  )
);

drop policy if exists "Supervisors view assigned staff audit log" on public.audit_log;
create policy "Supervisors view assigned staff audit log" on public.audit_log for select to authenticated
using (
  exists (
    select 1 from public.applications
    join public.staff_supervisors on staff_supervisors.staff_id = applications.submitted_by
    where applications.id = audit_log.application_id
      and staff_supervisors.supervisor_id = auth.uid()
  )
);

-- The app reads Class directly from applications, so existing applications_full
-- views do not need to be rebuilt for this feature.
