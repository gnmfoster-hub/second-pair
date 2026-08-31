-- Erasure has to clear the whole diary, not just the bookings from enquiries.
--
-- The previous version deleted conversations and relied on the cascade —
-- conversations to enquiries to bookings — to free the artists that
-- `bookings.artist_id on delete restrict` would otherwise pin.
--
-- That held only while every booking came from a conversation. Once the diary
-- could hold manual entries, a studio with a single day off in it could not be
-- erased at all: the manual booking survived the cascade and blocked the
-- artist delete, so the whole request failed.
--
-- A business asking to be erased under UK GDPR must not be refused because
-- somebody once blocked out a Tuesday afternoon.

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

  -- Everything in the diary, however it got there. Done first and by artist,
  -- because this is the table that pins the rest.
  delete from bookings
  where artist_id in (select id from artists where studio_id = target);

  -- Cascades to messages and enquiries.
  delete from conversations where studio_id = target;

  -- Cascades to artists, price_bands, faqs, contacts and studio_members.
  delete from studios where id = target;
end;
$fn$;
