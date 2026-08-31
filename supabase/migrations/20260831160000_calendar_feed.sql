-- Putting the diary on their phone.
--
-- A published iCal feed rather than the Google Calendar API. The API means
-- OAuth, refresh tokens, per-user consent screens, webhook renewals and a
-- verification review — and at the end of it, it works for Google and nothing
-- else. A feed works with Google, Apple, Outlook, Thunderbird and anything
-- else that has ever read a calendar, with no account to connect.
--
-- The trade is freshness: subscribing calendars poll on their own schedule,
-- and Google in particular can be hours behind. That is stated plainly in the
-- app rather than hidden, because somebody who thinks it is instant will get
-- caught out by it.
--
-- The token is the whole security model: the URL is the credential, so it is
-- long, random, and revocable. It is deliberately not the studio id — that
-- appears in other places and must never become a way to read the diary.

-- gen_random_bytes lives in pgcrypto, which is not in the search path here.
-- gen_random_uuid is built in from Postgres 13, and two of them stripped of
-- their hyphens give 64 hex characters — more than enough to be unguessable.
create or replace function new_calendar_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '') ||
         replace(gen_random_uuid()::text, '-', '');
$$;

alter table studios
  add column calendar_token text not null default new_calendar_token();

alter table artists
  add column calendar_token text not null default new_calendar_token();

create unique index studios_calendar_token_key on studios (calendar_token);
create unique index artists_calendar_token_key on artists (calendar_token);

comment on column studios.calendar_token is
  'Secret in the subscribe URL for the whole business. Anyone holding it can read the diary, so rotating it is how access is revoked.';

comment on column artists.calendar_token is
  'Same, for one person''s own feed — so a stylist can subscribe to theirs without seeing everyone else''s.';

-- How the owner chooses to read the grid. Colour by what the entry is, whose
-- client it is, or which of the team it belongs to.
create type diary_colour as enum ('category', 'client', 'person');

alter table studios
  add column diary_colour diary_colour not null default 'category';

comment on column studios.diary_colour is
  'What the colour of an entry means in the diary. Per business, because a one-person shop and a five-chair salon want different answers.';
