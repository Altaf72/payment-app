-- Payment Application live updates: run once in Supabase SQL Editor.
-- Makes new and updated applications appear in open My Applications screens
-- without a browser refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'applications'
  ) then
    alter publication supabase_realtime add table public.applications;
  end if;
end;
$$;
