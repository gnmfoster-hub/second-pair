-- A column in the diary that is a place, and a person who has no way in.
--
-- Two things about the same table, both of which came out of the same
-- observation: "artist" has been doing the work of three different nouns.
--
-- A bay, a room, a chair, a van. A garage books two cars into two bays and a
-- salon books two clients into two chairs, and neither of those is a person —
-- so the page asked a bay for an email address, a login, a Stripe account and
-- a phone number to notify, none of which a bay can have. Ticking this stops
-- all of that being asked.
--
-- And whether somebody has a way in of their own. A personal booking link
-- ignores the business's rules about who may be offered, which is exactly
-- right for a chair renter running her own list under somebody else's roof,
-- and exactly wrong for an employee. Off means there is no route to them but
-- through the business.
--
-- Both default to how things behave today: nobody is a resource until somebody
-- says so, and everybody keeps the link they already had.
--
-- Written as a file after the fact. These two were pasted into the database by
-- hand from a worklist and never existed as migrations, so a fresh database
-- built from this folder came up without them, and the check that reports
-- outstanding migrations could not see them at all. Harmless to run twice.

alter table artists
  add column if not exists is_resource boolean not null default false;

comment on column artists.is_resource is
  'This diary column is a place — a bay, a room, a chair — not a person. Suppresses everything a place cannot have: login, email, Stripe, notifications.';

alter table artists
  add column if not exists own_link boolean not null default true;

comment on column artists.own_link is
  'Whether this person has a booking link of their own, which bypasses the business''s rules about who is offered. Right for a chair renter, wrong for an employee.';
