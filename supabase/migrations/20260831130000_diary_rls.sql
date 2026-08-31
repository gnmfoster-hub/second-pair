-- The owner could not see their own diary.
--
-- The original policy reached a booking through its enquiry:
--
--   exists (select 1 from enquiries e join conversations c ...
--           where e.id = enquiry_id and is_studio_member(c.studio_id))
--
-- That was written when every booking came from a conversation. Once the diary
-- learned to hold manual entries — blocks, days off, a dentist appointment, a
-- delivery — those rows had `enquiry_id` null, so the subquery found nothing
-- and the policy denied both reading and writing them.
--
-- The effect was that the whole manual diary silently did not work: entries
-- could not be created, and any that existed were invisible.
--
-- Every booking has an artist, and every artist has a studio, so that is the
-- honest route to ownership. It is also simpler, and it covers assistant
-- bookings exactly as well as the old one did.

drop policy if exists bookings_rw on bookings;

create policy bookings_rw on bookings for all
  using (
    exists (
      select 1 from artists a
      where a.id = bookings.artist_id and is_studio_member(a.studio_id)
    )
  )
  with check (
    exists (
      select 1 from artists a
      where a.id = bookings.artist_id and is_studio_member(a.studio_id)
    )
  );

comment on table bookings is
  'Everything in the diary: appointments from conversations, and anything the owner puts in by hand. Ownership is through the artist, not the enquiry.';
