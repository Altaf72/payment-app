-- Supervisor oversight and Finance-managed application classes.
-- Run once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('staff','supervisor','gro','manager','finance','ceo','cfo','superadmin'));

alter table public.applications add column if not exists class_name text;
alter table public.applications add column if not exists class_names text[] not null default '{}';
update public.applications
set class_names = array[class_name]
where class_name is not null and class_name <> '' and cardinality(class_names) = 0;
create index if not exists applications_class_name_idx on public.applications (class_name);
create index if not exists applications_class_names_idx on public.applications using gin (class_names);

create or replace function public.current_user_is_superadmin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'superadmin');
$$;

grant execute on function public.current_user_is_superadmin() to authenticated;

create table if not exists public.staff_supervisors (
  staff_id uuid not null references public.users(id) on delete cascade,
  supervisor_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, supervisor_id),
  check (staff_id <> supervisor_id)
);

create or replace function public.current_user_supervises(p_staff_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_supervisors
    where staff_id = p_staff_id and supervisor_id = auth.uid()
  );
$$;
grant execute on function public.current_user_supervises(uuid) to authenticated;

alter table public.staff_supervisors enable row level security;
drop policy if exists "Admins manage supervisor assignments" on public.staff_supervisors;
create policy "Admins manage supervisor assignments" on public.staff_supervisors for all to authenticated
using (public.current_user_is_superadmin())
with check (public.current_user_is_superadmin());
drop policy if exists "Supervisors read their assignments" on public.staff_supervisors;
create policy "Supervisors read their assignments" on public.staff_supervisors for select to authenticated
using (supervisor_id = auth.uid() or staff_id = auth.uid());
grant select, insert, delete on public.staff_supervisors to authenticated;

-- Allows the Supervisor Dashboard to display names and emails for assigned
-- staff only (for example, Tim can see testsupv after the assignment is made).
drop policy if exists "Supervisors view assigned staff profiles" on public.users;
create policy "Supervisors view assigned staff profiles" on public.users for select to authenticated
using (public.current_user_supervises(users.id));

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

-- Keep historic display/export text and multi-property selections aligned when
-- Finance renames an Apartment / Property Class.
create or replace function public.rename_application_class_on_applications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.applications
    set class_names = array_replace(class_names, old.name, new.name),
        class_name = array_to_string(array_replace(class_names, old.name, new.name), ', ')
    where old.name = any(class_names);
  end if;
  return new;
end;
$$;
drop trigger if exists application_class_rename on public.application_classes;
create trigger application_class_rename after update of name on public.application_classes
for each row execute function public.rename_application_class_on_applications();

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

-- Supervisors can create receipts for their own company assignments and view
-- receipts created by any staff member assigned to them.
drop policy if exists "Holiday receipt access" on public.holiday_home_receipts;
create policy "Holiday receipt access" on public.holiday_home_receipts for select to authenticated using (
  (
    exists (select 1 from public.users where id = auth.uid() and (role in ('superadmin','finance','cfo','supervisor') or holiday_home_receipts_enabled))
    and exists (select 1 from public.user_companies where user_id = auth.uid() and company_id = holiday_home_receipts.company_id)
  )
  or exists (
    select 1 from public.staff_supervisors
    where staff_supervisors.staff_id = holiday_home_receipts.created_by
      and staff_supervisors.supervisor_id = auth.uid()
  )
);

drop policy if exists "Holiday receipt create" on public.holiday_home_receipts;
create policy "Holiday receipt create" on public.holiday_home_receipts for insert to authenticated with check (
  created_by = auth.uid()
  and exists (select 1 from public.users where id = auth.uid() and (role in ('superadmin','supervisor') or holiday_home_receipts_enabled))
  and exists (select 1 from public.user_companies where user_id = auth.uid() and company_id = holiday_home_receipts.company_id)
);

-- The app reads Class directly from applications, so existing applications_full
-- views do not need to be rebuilt for this feature.
