-- Whose message was that?
--
-- Not run yet. Adding a nullable column and filling in what can be worked out;
-- nothing reads differently until it runs, and nothing sends differently after.
--
-- Found by the new "Is it working?" page, which has to report reviews and
-- campaigns as unknown rather than answer for them.
--
-- Both record having gone by claiming a row in handled_messages — the dedupe
-- table, keyed "review:<booking>" and "campaign:<campaign>:<booking>". Claiming
-- the row before sending is what stops the same person being asked twice when
-- a sweep overlaps itself, and it works. What it cannot do is say who it was
-- for: the table is message_id, channel and a timestamp, and nothing else.
--
-- So "has this salon ever asked anybody for a review" is a question the data
-- cannot answer — not on that page, and not in any report we might want later.
-- A dedupe key is a fine thing to be opaque; a record of everything the
-- product has ever sent is not.
--
-- ── The backfill ───────────────────────────────────────────────────────────
--
-- Both keys end in a booking id, so every existing row can be attributed
-- rather than written off. Worth the extra twenty lines: without it, every
-- business that has asked for reviews for months would read "never used" on
-- the day this lands, which is a worse answer than the honest "unknown" it
-- replaces.
--
-- Guarded by a shape check before the cast, because one malformed key would
-- otherwise take the whole migration down with it.

alter table handled_messages
  add column if not exists studio_id uuid references studios (id) on delete cascade;

create index if not exists handled_messages_studio_idx
  on handled_messages (studio_id, seen_at);

-- Reviews: "review:<booking>"
update handled_messages h
set studio_id = a.studio_id
from bookings b
join artists a on a.id = b.artist_id
where h.studio_id is null
  and h.message_id like 'review:%'
  and split_part(h.message_id, ':', 2) ~ '^[0-9a-f-]{36}$'
  and b.id = split_part(h.message_id, ':', 2)::uuid;

-- Campaigns: "campaign:<campaign>:<booking>"
update handled_messages h
set studio_id = a.studio_id
from bookings b
join artists a on a.id = b.artist_id
where h.studio_id is null
  and h.message_id like 'campaign:%'
  and split_part(h.message_id, ':', 3) ~ '^[0-9a-f-]{36}$'
  and b.id = split_part(h.message_id, ':', 3)::uuid;

comment on column handled_messages.studio_id is
  'Which business this send belonged to. Null on rows written before this column, and on anything not tied to a business. Nothing depends on it for dedupe — that is message_id alone — it exists so a send can be counted.';
