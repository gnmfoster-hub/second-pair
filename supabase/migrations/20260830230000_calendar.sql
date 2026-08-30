-- A diary someone can actually run their business from.
--
-- Two ideas make the rest fall out:
--
--   category            what kind of thing it is, so the week reads at a glance
--   blocks_availability whether it takes time, or is only a note in the day
--
-- A supplier delivery to chase is a reminder — it must not stop the assistant
-- offering that hour. A dentist appointment must. Getting that distinction
-- wrong either loses the owner bookings or double-books them, so it is explicit
-- rather than inferred from the category.

alter table bookings
  add column category text not null default 'appointment',
  add column all_day boolean not null default false,
  -- Client appointments and time off take the slot; reminders sit alongside.
  add column blocks_availability boolean not null default true;

comment on column bookings.category is
  'appointment, consultation, meeting, admin, supplies, break, holiday, personal, training, other.';
comment on column bookings.blocks_availability is
  'False for notes and reminders that should not stop the assistant offering that time.';

-- Anything the assistant booked always takes the slot.
update bookings set category = case
  when source = 'block' then 'holiday'
  when type = 'consultation' then 'consultation'
  else 'appointment'
end;

-- The no-overlap guarantee now applies only to things that take time, so two
-- reminders on the same afternoon are fine and two appointments still are not.
alter table bookings drop constraint bookings_no_overlap;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    artist_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (cancelled_at is null and blocks_availability);

create index bookings_calendar_idx on bookings (artist_id, starts_at)
  where cancelled_at is null;
