-- Offboarding a studio, as required by the UK GDPR erasure guardrail.
--
-- A plain `delete from studios` fails once any booking exists: the cascade
-- reaches artists, and bookings.artist_id is `on delete restrict` so that an
-- artist with work in the diary cannot be quietly deleted. That restrict is
-- worth keeping, so erasure clears conversations first (which cascades through
-- messages, enquiries and bookings) and only then drops the studio.

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

  -- Reference images the client sent, filed under <studio_id>/...
  delete from storage.objects
  where bucket_id = 'references'
    and (storage.foldername(name))[1] = target::text;

  -- Cascades to messages, enquiries and in turn bookings, freeing the artists.
  delete from conversations where studio_id = target;

  -- Cascades to artists, price_bands, faqs, contacts and studio_members.
  delete from studios where id = target;
end;
$fn$;

revoke all on function delete_studio(uuid) from public;
grant execute on function delete_studio(uuid) to authenticated;
