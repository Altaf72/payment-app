-- Allow application participants to open supporting documents from the
-- private attachments bucket. Run once in the Supabase SQL Editor.

drop policy if exists "Application participants can read attachments" on storage.objects;
create policy "Application participants can read attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'attachments'
  and (
    -- The applicant can read every document belonging to their application,
    -- including a later document uploaded by Finance under Finance's folder.
    exists (
      select 1
      from public.applications a
      where a.submitted_by = auth.uid()
        and (
          a.attachment_path = storage.objects.name
          or split_part(storage.objects.name, '/', 2) = a.id::text
        )
    )
    -- A supervisor can read documents for their assigned staff.
    or exists (
      select 1
      from public.applications a
      join public.staff_supervisors ss on ss.staff_id = a.submitted_by
      where ss.supervisor_id = auth.uid()
        and split_part(storage.objects.name, '/', 2) = a.id::text
    )
    -- Assigned managers can read their review documents.
    or exists (
      select 1
      from public.applications a
      where a.manager_id = auth.uid()
        and split_part(storage.objects.name, '/', 2) = a.id::text
    )
    -- Finance and executive review roles retain their existing broad access.
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('finance', 'cfo', 'ceo', 'superadmin')
    )
  )
);
