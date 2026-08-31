-- Who an enquiry is for.
--
-- Businesses in this market are set up in at least four different ways and the
-- assistant has to behave differently in each:
--
--   1. One person, their own socials. Every enquiry is theirs.
--   2. A shop with one shared Instagram and five stylists. The assistant has to
--      find out who they want, or offer whoever is free.
--   3. A shop where every stylist has their own Instagram. An enquiry on
--      Sarah's account is for Sarah, and asking "who would you like?" is daft.
--   4. Both at once — a shop account, plus some staff with their own and some
--      without.
--
-- The thing that makes all four work is one nullable column: a channel belongs
-- either to the business or to a specific person. Null means the shop.

-- Messenger was missing. It is a distinct inbox from Instagram even though the
-- same Meta app serves both, and a salon may well have one and not the other.
alter type channel add value if not exists 'messenger';

-- A short, readable name for a person's own link. Goes in an Instagram bio, so
-- "the-fold-hair?with=sarah" beats a UUID.
alter table artists
  add column handle text;

create unique index artists_studio_handle_key
  on artists (studio_id, lower(handle))
  where handle is not null;

comment on column artists.handle is
  'Short name used in this person''s own booking link. Unique within the studio.';

-- Every way the outside world can reach this business.
create table channel_connections (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,

  -- The whole point of this table. Null means the connection belongs to the
  -- business, so the assistant asks who they want. Set means every enquiry
  -- arriving here is for that person, and it must never ask.
  artist_id    uuid references artists(id) on delete cascade,

  channel      channel not null,

  -- What the provider calls this account: a WhatsApp phone number id, an
  -- Instagram business account id, a Facebook page id. Null for the widget,
  -- which is addressed by the studio slug and handle instead.
  external_id  text,

  -- What it is called to a human: "@thefoldhair", "07700 900123".
  label        text,

  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index on channel_connections (studio_id, active);

-- One account cannot serve two businesses, or the wrong studio would answer it.
create unique index channel_connections_external_key
  on channel_connections (channel, external_id)
  where external_id is not null;

alter table channel_connections enable row level security;

create policy "studio members manage channel connections" on channel_connections
  for all
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

-- Which person this conversation is for, when that was known on arrival —
-- because of the account it came in on, or the link that was used.
--
-- Deliberately separate from enquiries.artist_id, which is what the client
-- asked for during the conversation. This one is a fact about the channel and
-- is set before a word is exchanged.
alter table conversations
  add column artist_id uuid references artists(id) on delete set null,
  add column channel_connection_id uuid references channel_connections(id) on delete set null;

comment on column conversations.artist_id is
  'Set when the channel or link identifies one person. The assistant then never asks who they want.';

-- Every existing business gets a shop-wide widget connection, so nothing has a
-- special case for "set up before channels existed".
insert into channel_connections (studio_id, channel, label)
select id, 'web', 'Website and link'
from studios;
