-- A wedding party, booked as one thing.
--
-- Five people in on the same morning is five appointments and one arrangement.
-- The diary can already hold the five; what it cannot hold is the fact that
-- they belong together — so moving the bride moves nothing else, cancelling
-- the party means finding five rows by eye, and nobody can see at a glance
-- that Thursday morning is entirely spoken for by one family.
--
-- It is not only weddings. A house with four rooms to paint, a family of three
-- in for haircuts, a landlord with two flats to clean on the same trip.

create table if not exists booking_groups (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,

  -- What to call it, in the business's words. "Sarah's wedding", "14 Grove Rd".
  name        text not null,

  /*
   * Who is organising, where somebody is.
   *
   * Nullable because often nobody is — three haircuts for one family have no
   * lead, they are just three haircuts. Where there is one, this is who gets
   * rung when the whole thing has to move.
   */
  lead_contact_id uuid references contacts(id) on delete set null,

  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists booking_groups_studio_idx on booking_groups (studio_id, created_at);

/*
 * Which arrangement a booking belongs to.
 *
 * `on delete set null` and deliberately not cascade. Deleting the arrangement
 * must not delete five real appointments out of a real diary — the party is
 * called off, the appointments are cancelled by somebody who means to, and a
 * tidying-up operation that empties a Thursday morning is not a feature.
 */
alter table bookings
  add column if not exists group_id uuid references booking_groups(id) on delete set null;

create index if not exists bookings_group_idx on bookings (group_id);

comment on column bookings.group_id is
  'The arrangement this belongs to, where it is one of several booked together. Null for almost every booking.';

alter table booking_groups enable row level security;

-- Anybody in the business. A wedding party is taken by whoever answers the
-- phone, and made up of appointments across several people's diaries, so
-- making it the owner's would mean the owner typing in everybody's morning.
drop policy if exists booking_groups_member on booking_groups;
create policy booking_groups_member on booking_groups for all
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));
