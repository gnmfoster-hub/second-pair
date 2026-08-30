-- Regular things: a day off every Monday, lunch every day, a standing meeting.
--
-- Stored as a rule plus generated occurrences rather than as a rule alone.
-- Occurrences are real rows, which means the no-overlap constraint, the
-- assistant's availability query and the diary all keep working untouched —
-- and a single week can be moved or cancelled without breaking the pattern.

create type repeat_rule as enum ('none', 'daily', 'weekdays', 'weekly', 'fortnightly', 'monthly');

alter table bookings
  add column repeats repeat_rule not null default 'none',
  -- Every occurrence points at the first one, so the set can be found again.
  add column repeat_parent_id uuid references bookings(id) on delete cascade,
  -- When the pattern stops generating. Null means the horizon below.
  add column repeat_until date;

create index bookings_repeat_parent_idx on bookings (repeat_parent_id)
  where repeat_parent_id is not null;

comment on column bookings.repeats is
  'How the entry repeats. Occurrences are generated rows pointing at the first via repeat_parent_id.';
comment on column bookings.repeat_parent_id is
  'The first entry in a repeating set. Null on one-offs and on the first entry itself.';
