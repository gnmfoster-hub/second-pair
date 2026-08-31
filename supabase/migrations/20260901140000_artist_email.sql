-- An address for the people who work here.
--
-- Giving somebody a login currently means copying a link and sending it
-- yourself. That works, and it will go on working — plenty of these will be
-- handed over in person. But it is the first thing a new member of staff ever
-- sees from the system, and "here is a URL, paste it in" is a poor start.
--
-- Nullable, because the owner may not have it and must not be stopped from
-- adding somebody without it.

alter table artists
  add column email text;

comment on column artists.email is
  'Where to send this person their invitation. Optional — a link can still be copied by hand.';
