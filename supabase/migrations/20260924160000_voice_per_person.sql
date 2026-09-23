-- The telephone, sold per person as well as per business.
--
-- Not run yet. Nothing changes until it is: voice_on is off for everybody and
-- the app reads an absent column as off.
--
-- Giles: per business, because per person would be expensive — but if it can
-- be done per person then do it, and I will need to charge for each individual
-- instance, so it needs switching on, and all my spend must be clear to me.
--
-- Three things that asks for, and only the first was already there.
--
-- 1. Switching it on. channels_allowed already carries "voice" for a business.
--    This is the same idea one level down: whether one person has a telephone
--    of their own, which is a separate thing to sell and a separate thing to
--    pay for.
--
-- 2. Knowing whose call it was. The calls table records to_number and nothing
--    about who owns it, so a bill could be worked out for a business and never
--    for a person. Derivable, in theory, by looking the number up against the
--    connections — and wrong, in practice, the first time a number is handed
--    from one stylist to another, because it would rewrite every call that
--    person had ever taken. Whose it was at the time is a fact about the call,
--    so it belongs on the call.
--
-- 3. The spend. Admin -> Reports already prices calls properly: four legs,
--    whole minutes rounded up per leg, the outbound one to a mobile costing
--    roughly six times the inbound. With the column above, the same arithmetic
--    answers per person as well as per business.
--
-- A call with no artist_id is the business's, which is what every call to date
-- is. Null is the honest value for those rather than a guess at who was on.

alter table artists
  add column if not exists voice_on boolean not null default false;

alter table calls
  add column if not exists artist_id uuid references artists (id) on delete set null;

create index if not exists calls_artist_idx on calls (artist_id);

comment on column artists.voice_on is
  'This person has a telephone of their own. Charged per instance: see Admin -> Reports for what it costs.';

comment on column calls.artist_id is
  'Whose number was rung, as it stood at the time. Null means the business own. Never re-derived: a number can change hands.';
