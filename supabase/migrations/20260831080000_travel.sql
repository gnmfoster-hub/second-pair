-- Work that happens at the customer's address.
--
-- An electrician, a plumber, a mobile hairdresser: the appointment is somewhere
-- else, and the diary has to account for getting there. Without it the
-- assistant will cheerfully book two jobs an hour apart at opposite ends of a
-- city, which is worse than not booking at all.
--
-- Deliberately not real drive-time routing. That needs a maps provider, a key
-- and a per-request cost, and a fixed buffer between jobs is what a one-person
-- business actually needs. Routing can replace the buffer later without
-- changing anything above it.

create type travel_mode as enum ('at_premises', 'at_customer', 'both');

alter table studios
  add column travel_mode travel_mode not null default 'at_premises',
  -- Padding either side of a job that happens elsewhere.
  add column travel_buffer_minutes integer not null default 30
    check (travel_buffer_minutes >= 0 and travel_buffer_minutes <= 240),
  -- Outward postcodes covered, e.g. {BS,BA,TA}. Empty means everywhere.
  add column service_areas text[] not null default '{}';

comment on column studios.travel_buffer_minutes is
  'Time left either side of a job at the customer''s address, so back-to-back jobs across town cannot be booked.';
comment on column studios.service_areas is
  'Outward postcode prefixes covered. Empty means no restriction.';

-- Where the job is. Null for anything at the business's own premises.
alter table enquiries
  add column job_address text,
  add column job_postcode text;

comment on column enquiries.job_postcode is
  'Checked against the studio''s service areas before a slot is ever offered.';
