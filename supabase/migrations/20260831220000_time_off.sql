-- The regular gaps inside somebody's week.
--
-- Working hours say which days a person is in. They cannot say that Sarah
-- takes lunch at one, does the school run at three on Wednesdays, or leaves
-- early on a Friday — and those are the times a business most often gets
-- caught out on, because they are invisible until somebody is booked into one.
--
-- It could be done with repeating diary entries, and for a one-off it should
-- be. But a recurring pattern belongs on the person, not in the diary: it is
-- part of who they are and when they work, it should be set when they are
-- added, and it should not need fifty-two rows a year to express.
--
-- Shape:
--   [{ "label": "Lunch", "days": [1,2,3,4,5], "from": "13:00", "to": "14:00" }]
--
-- Days are 0-6 with Sunday as 0, matching the hours column and JavaScript.

alter table artists
  add column time_off jsonb not null default '[]'::jsonb;

comment on column artists.time_off is
  'Recurring unavailable periods inside this person''s working week — lunch, a school run, an early finish. One-offs belong in the diary.';
