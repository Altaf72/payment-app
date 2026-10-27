-- Verified, administrator-only undo for the merged account flag.
-- This does not move applications back: a merge does not keep a per-record
-- history of which applications belonged to the source account.
create or replace function public.reset_merged_user(p_user_id uuid)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  reset_user public.users;
begin
  select role into current_role from public.users where id = auth.uid();
  if current_role <> 'superadmin' then
    raise exception 'Only a System Administrator can reset merge information.';
  end if;

  update public.users
  set merged_into = null,
      is_active = true
  where id = p_user_id
    and merged_into is not null
  returning * into reset_user;

  if reset_user.id is null then
    raise exception 'Merged user not found, or the merge information was already reset.';
  end if;
  return reset_user;
end;
$$;

grant execute on function public.reset_merged_user(uuid) to authenticated;
