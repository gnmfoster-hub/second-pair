-- Where a business's diary actually lives.
--
-- Handled keeps its own diary by default: no OAuth, no third party, works the
-- hour a business signs up. Everything else is an adapter for businesses that
-- already run something and are not going to move:
--
--   native     our own bookings table. Reads and writes. The default.
--   google     Google Calendar. Reads and writes.
--   ical_link  Fresha, Booksy, Treatwell, Square. Reads the published feed;
--              the customer books on the platform's own page.
--   link_only  a booking page and nothing else.
--   manual     no diary we can reach. Collect preferences, owner confirms.

alter table artists
  add column booking_provider text not null default 'native',
  -- Subscription feed for ical_link. Read-only, busy times only.
  add column ical_url text,
  -- Public booking page the customer is sent to.
  add column booking_url text;

alter table artists
  add constraint artists_booking_provider_valid
  check (booking_provider in ('native', 'google', 'ical_link', 'link_only', 'manual'));

comment on column artists.booking_provider is
  'Which diary this person''s availability comes from. native = Handled''s own.';

-- ---------------------------------------------------------------- studio booking rules

alter table studios
  -- Nothing may be booked inside this many hours from now.
  add column notice_hours integer not null default 24
    check (notice_hours >= 0 and notice_hours <= 720),
  -- How long a consultation runs, when the band calls for one first.
  add column consultation_minutes integer not null default 30
    check (consultation_minutes > 0 and consultation_minutes <= 480),
  -- Longest single sitting offered; bigger jobs are split across appointments.
  add column max_session_minutes integer not null default 360
    check (max_session_minutes > 0 and max_session_minutes <= 1440);

-- ---------------------------------------------------------------- holding a slot

-- A booking exists before its deposit is paid, so the slot is held while the
-- client goes to pay. Unpaid holds are swept up by a scheduled job.
alter table bookings
  add column held_until timestamptz;

create index bookings_held_idx on bookings (held_until)
  where deposit_status = 'unpaid' and cancelled_at is null;

-- Two appointments for the same person at the same time is the one bug that
-- must never reach a diary, so the database refuses it outright rather than
-- trusting the application to check first.
create extension if not exists btree_gist;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    artist_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (cancelled_at is null);
