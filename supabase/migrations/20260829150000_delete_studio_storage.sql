-- Supabase rejects direct deletes from storage.objects ("Direct deletion from
-- storage tables is not allowed. Use the Storage API instead."), so the erasure
-- function cannot clear reference images itself.
--
-- Database rows are erased here; the caller is responsible for removing the
-- <studio_id>/ prefix from the `references` bucket through the Storage API
-- first. Anything calling this must do both to satisfy the GDPR guardrail.

create or replace function delete_studio(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not is_studio_member(target) then
    raise exception 'not a member of this studio';
  end if;

  -- Cascades to messages, enquiries and in turn bookings, which frees the
  -- artists that bookings.artist_id's `on delete restrict` would otherwise pin.
  delete from conversations where studio_id = target;

  -- Cascades to artists, price_bands, faqs, contacts and studio_members.
  delete from studios where id = target;
end;
$fn$;
