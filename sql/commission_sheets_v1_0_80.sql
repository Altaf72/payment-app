-- Commission Input Sheet v1.0.80
-- Persist exact Google Drive file IDs so attachments remain addressable even when
-- display-name reconstruction or folder metadata changes.

alter table public.commission_sheet_documents
  add column if not exists drive_files jsonb not null default '[]'::jsonb;

comment on column public.commission_sheet_documents.drive_files is
  'Ordered attachment metadata: Google Drive file ID, stored Drive name, display name, and MIME type.';

notify pgrst, 'reload schema';
