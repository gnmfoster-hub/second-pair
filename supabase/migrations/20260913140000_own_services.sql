-- Things one person offers, that the shop as a whole does not.
--
-- A nail technician working inside a salon has her own list — gels, wraps,
-- removals, twenty colours — and none of it belongs on the salon's price list,
-- because no stylist there does any of it. The same is true of a piercer in a
-- tattoo studio, a sports therapist in a clinic, and the person in a garage
-- who does the MOTs.
--
-- Today every service belongs to the business and only the owner can add one,
-- so the nail technician's list either clutters the shop's price list for
-- everybody, or does not exist.
--
-- Null means the business's, which is what nearly every row is and stays: the
-- common case costs nothing to express.
alter table services
  add column if not exists artist_id uuid references artists(id) on delete cascade;

comment on column services.artist_id is
  'Whose it is. Null is the business''s, and everybody offers it. Set means only that person does, and the assistant offers it only when booking with them.';

create index if not exists services_artist_idx on services (artist_id);

-- A person may keep their own list.
--
-- The owner could already do everything here, and still can. This adds the
-- other half: somebody may create, change and retire the things that are
-- theirs, and nobody else's.
--
-- The check is on artist_id pointing at their own row, in both directions —
-- using and with check — so a person cannot hand one of their services to
-- somebody else, or take one of the shop's by writing their own id onto it.
create policy services_own on services for all
  using (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = services.artist_id and a.user_id = auth.uid()
    )
  )
  with check (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = services.artist_id and a.user_id = auth.uid()
    )
  );


-- Hearing about every enquiry, not only the ones that need you.
--
-- A business is told when a booking becomes real, when the assistant hands a
-- conversation over, and when it stands back for the owner to answer first.
-- An enquiry the assistant handled from start to finish sends nothing at all,
-- deliberately: the whole point is that it did not need anybody.
--
-- That is right for most people and wrong for some. Somebody who has just
-- started trusting it wants to see every one until they believe it, and
-- somebody who likes knowing what came in overnight never stops wanting to.
-- Being unable to ask for that reads as the product hiding its work.
--
-- Off by default, because a notification for every enquiry is the fastest way
-- to teach somebody to ignore all of them — including the one that mattered.
alter table studios
  add column if not exists notify_every_enquiry boolean not null default false;

comment on column studios.notify_every_enquiry is
  'Tell the business about every enquiry the assistant answered, not only the ones needing a person. Off by default: an alert for everything is an alert for nothing.';
