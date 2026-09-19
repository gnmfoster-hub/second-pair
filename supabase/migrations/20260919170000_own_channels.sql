-- Which channels a person is allowed one of their own on.
--
-- There were already two halves of this and they are not the same question.
-- channel_connections.artist_id says who a connected account belongs to —
-- allocation, and it needs an account to exist first. What was missing is the
-- decision that comes before it: whether this person may have their own at all.
--
-- Which is what an owner actually sets up. A salon decides that senior stylists
-- take their own bookings on their own Instagram and the apprentice does not,
-- and it decides that before anybody connects anything. Without this the only
-- way to express it was to connect an account and then take it away again, and
-- on a channel with nothing connected — which is most of them, most of the time
-- — there was no way to express it at all.
--
-- Empty means none, which is what every business has today, so running this
-- changes nothing anywhere. The one thing it does change is that connecting
-- your own Instagram now needs the owner to have allowed it first, which is
-- what Giles described and what it should always have been.

alter table artists
  add column if not exists own_channels text[] not null default '{}';

comment on column artists.own_channels is
  'Channels this person may have their own account or number on. Empty means none; the business''s channels still reach them.';
