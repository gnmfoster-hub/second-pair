-- Somebody's own calendar, blocking their own time.
--
-- Three things have shared the word "calendar" here and only two existed: the
-- feed going out (subscribe to your Second Pair diary from Google or Apple),
-- and a booking system living elsewhere (Fresha, Booksy, Square) read through
-- ical_url. What was missing is the ordinary one — the dentist, the school run,
-- the funeral — so the assistant would book straight over a person's life.
--
-- Deliberately separate from ical_url. That column answers "where does this
-- business keep its diary"; this one answers "what else is this person doing".
-- A stylist can have both: a salon on Fresha and her own life in Apple
-- Calendar. Reusing one column would have made those mutually exclusive.
alter table artists
  add column if not exists personal_ical_url text,
  -- Shown in the business diary by default, as a block in their column, so the
  -- day reads true to whoever is looking at it.
  add column if not exists personal_calendar_show boolean not null default true,
  -- But not what it says, by default. A personal calendar holds "Dr Patel 3pm"
  -- and "counselling", and the diary is read by everybody who works there.
  -- Showing the block is the useful half; showing the words is a choice with a
  -- cost, and it is theirs to make rather than ours to assume.
  add column if not exists personal_calendar_titles boolean not null default false,
  -- What happened last time we read it, so a feed that has stopped working says
  -- so on the settings page rather than quietly leaving somebody bookable when
  -- they are not.
  add column if not exists personal_calendar_error text,
  add column if not exists personal_calendar_read_at timestamptz;

comment on column artists.personal_ical_url is
  'Secret subscription address of this person''s own calendar. Read only, never written.';
