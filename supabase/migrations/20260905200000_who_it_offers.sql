-- Who each assistant is allowed to offer.
--
-- There are two assistants in every business and neither could be told who to
-- speak for.
--
-- The business's own — the widget on the website — offered every active person
-- there was. A salon with a stylist who only takes her own regulars, or an
-- apprentice not ready for the website yet, had no way to say so: the moment
-- somebody was added so they could be put in the diary, the assistant started
-- selling their time to strangers.
--
-- And a person's own link was locked to them entirely. That is right for most
-- people and wrong for a shop where the receptionist's link should be able to
-- book anybody, or where two colleagues happily cover for each other.
--
-- Null on the studio means everyone active, which is what every business has
-- today — a default that changes nothing until somebody chooses otherwise.
alter table studios
  add column if not exists offers_artists uuid[];

comment on column studios.offers_artists is
  'Which people the business assistant may offer. Null means everyone who is active.';

-- only_me is the behaviour every personal link has now, so nothing changes for
-- anybody until they ask it to.
alter table artists
  add column if not exists agent_scope text not null default 'only_me'
    check (agent_scope in ('only_me', 'me_first', 'anyone'));

comment on column artists.agent_scope is
  'What this person''s own link offers: only their diary, theirs first then others, or anybody.';
