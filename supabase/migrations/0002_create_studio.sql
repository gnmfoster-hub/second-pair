-- Creating the first studio is a chicken-and-egg problem: the RLS policy on
-- studios requires membership, and membership cannot exist before the studio.
-- This runs as definer to do both in one transaction.

create or replace function create_studio(studio_name text, studio_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if studio_name is null or btrim(studio_name) = '' then
    raise exception 'studio name is required';
  end if;

  insert into studios (name, slug)
  values (btrim(studio_name), lower(btrim(studio_slug)))
  returning id into new_id;

  insert into studio_members (studio_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$fn$;

revoke all on function create_studio(text, text) from public;
grant execute on function create_studio(text, text) to authenticated;
