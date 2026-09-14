-- Somebody who does not do one of the things the shop sells.
--
-- A salon's price list is the shop's, and no two people on it do all of it.
-- The junior does not do balayage; the barber does not do a full head of
-- foils; the nail technician does none of it. Today the assistant believes
-- everybody does everything on the list, so it will offer a stylist for work
-- she does not do, at a price she never set, and the first anybody hears of it
-- is somebody arriving for it.
--
-- price_bands have had this since August — service_providers says who does
-- which band, and the assistant honours it. Businesses that price by a named
-- list have had no equivalent at all, which is most of them.
--
-- Done on service_people rather than as a table of its own, because that row
-- already exists to say "this person, this service, differently": their own
-- minutes and their own price live on it. "They do not do it at all" is the
-- same kind of fact about the same pair, and a second table would mean two
-- places to look and two to keep in step.

alter table service_people
  add column if not exists offered boolean not null default true;

comment on column service_people.offered is
  'False where this person does not do this service at all. True, or no row, means they do — no row is the common case and stays the default, so nothing changes for a business that has never thought about it.';

-- Reading "who does not do what" for a whole business at once, which is what
-- the assistant asks on every conversation.
create index if not exists service_people_not_offered_idx
  on service_people (service_id) where offered = false;
