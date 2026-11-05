-- Shared payment confirmations for a Finance payment batch.
-- Run once in the Supabase SQL Editor after deploying the application update.

create extension if not exists pgcrypto;

create table if not exists public.payment_batch_attachments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payment_batches(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists payment_batch_attachments_batch_idx
  on public.payment_batch_attachments(batch_id, created_at);

alter table public.payment_batch_attachments enable row level security;

-- The applicant may read a confirmation attached to a batch containing one of
-- their applications. Finance and executive roles retain their normal access.
drop policy if exists "Batch participants can view confirmations" on public.payment_batch_attachments;
create policy "Batch participants can view confirmations"
on public.payment_batch_attachments for select to authenticated
using (
  exists (
    select 1 from public.applications a
    where a.batch_id = payment_batch_attachments.batch_id
      and a.submitted_by = auth.uid()
  )
  or exists (
    select 1 from public.applications a
    join public.staff_supervisors ss on ss.staff_id = a.submitted_by
    where a.batch_id = payment_batch_attachments.batch_id
      and ss.supervisor_id = auth.uid()
  )
  or exists (
    select 1 from public.applications a
    where a.batch_id = payment_batch_attachments.batch_id
      and a.manager_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role in ('finance', 'cfo', 'ceo', 'superadmin')
  )
);

drop policy if exists "Finance manages batch confirmations" on public.payment_batch_attachments;
create policy "Finance manages batch confirmations"
on public.payment_batch_attachments for all to authenticated
using (exists (
  select 1 from public.users u
  where u.id = auth.uid() and u.role in ('finance', 'superadmin')
))
with check (uploaded_by = auth.uid() and exists (
  select 1 from public.users u
  where u.id = auth.uid() and u.role in ('finance', 'superadmin')
));

grant select, insert, delete on public.payment_batch_attachments to authenticated;

-- Extend the private attachment-bucket read rule to batch confirmation paths.
drop policy if exists "Application participants can read attachments" on storage.objects;
create policy "Application participants can read attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and (
    exists (
      select 1 from public.applications a
      where a.submitted_by = auth.uid()
        and (a.attachment_path = storage.objects.name or split_part(storage.objects.name, '/', 2) = a.id::text)
    )
    or exists (
      select 1 from public.applications a
      join public.staff_supervisors ss on ss.staff_id = a.submitted_by
      where ss.supervisor_id = auth.uid() and split_part(storage.objects.name, '/', 2) = a.id::text
    )
    or exists (
      select 1 from public.applications a
      where a.manager_id = auth.uid() and split_part(storage.objects.name, '/', 2) = a.id::text
    )
    or exists (
      select 1 from public.payment_batch_attachments pba
      join public.applications a on a.batch_id = pba.batch_id
      where pba.storage_path = storage.objects.name and a.submitted_by = auth.uid()
    )
    or exists (
      select 1 from public.payment_batch_attachments pba
      join public.applications a on a.batch_id = pba.batch_id
      join public.staff_supervisors ss on ss.staff_id = a.submitted_by
      where pba.storage_path = storage.objects.name and ss.supervisor_id = auth.uid()
    )
    or exists (
      select 1 from public.payment_batch_attachments pba
      join public.applications a on a.batch_id = pba.batch_id
      where pba.storage_path = storage.objects.name and a.manager_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('finance', 'cfo', 'ceo', 'superadmin')
    )
  )
);

drop policy if exists "Finance uploads batch confirmations" on storage.objects;
create policy "Finance uploads batch confirmations"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and split_part(name, '/', 2) = 'batch'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('finance', 'superadmin')
  )
);

drop policy if exists "Finance deletes batch confirmations" on storage.objects;
create policy "Finance deletes batch confirmations"
on storage.objects for delete to authenticated
using (
  bucket_id = 'attachments'
  and split_part(name, '/', 2) = 'batch'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('finance', 'superadmin')
  )
);
