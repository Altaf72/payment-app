-- Multiple applicant attachments and screenshots.
-- Run once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.application_attachments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint,
  mime_type text,
  source text not null default 'file' check (source in ('file', 'screenshot')),
  uploaded_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists application_attachments_application_idx
  on public.application_attachments(application_id, created_at);

alter table public.application_attachments enable row level security;

drop policy if exists "Authenticated users can view application attachments" on public.application_attachments;
create policy "Authenticated users can view application attachments"
on public.application_attachments for select
to authenticated
using (true);

drop policy if exists "Application owners and finance roles can add attachments" on public.application_attachments;
create policy "Application owners and finance roles can add attachments"
on public.application_attachments for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    exists (
      select 1 from public.applications
      where applications.id = application_attachments.application_id
        and applications.submitted_by = auth.uid()
    )
    or exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('finance', 'cfo', 'ceo', 'superadmin')
    )
  )
);

drop policy if exists "Uploaders and finance roles can delete attachments" on public.application_attachments;
create policy "Uploaders and finance roles can delete attachments"
on public.application_attachments for delete
to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('finance', 'cfo', 'ceo', 'superadmin')
  )
);

grant select, insert, delete on public.application_attachments to authenticated;
