-- Stopping a business without destroying it.
--
-- The only way to end a relationship was to delete the studio outright, which
-- takes every conversation, booking and client with it and cannot be undone.
-- Most reasons for stopping are not permanent — a salon goes quiet over
-- winter, somebody stops paying and then pays, a trial ends and is picked up
-- again two months later — and none of them are worth losing a year of
-- somebody's bookings over.
--
-- Archived means the assistant stops answering for them and they leave every
-- figure and list, while everything they had stays exactly where it is. It is
-- reversible on any day, and deleting for good is a separate decision taken
-- later, deliberately, on something already switched off.
alter table studios
  add column if not exists archived_at timestamptz;

comment on column studios.archived_at is
  'Set when a business is stopped. The assistant refuses to answer, and it leaves the figures. Null means active.';

-- Every list of live businesses filters on this, so it is worth an index even
-- at this size: it is the column that decides whether anybody is served.
create index if not exists studios_active on studios (archived_at) where archived_at is null;
