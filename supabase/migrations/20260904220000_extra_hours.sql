-- "I'll work late on Thursday."
--
-- Everything about when somebody is available is a weekly pattern: the
-- business's opening hours, a person's own hours, their regular time off. All
-- of it repeats, and none of it can say anything about one particular day.
--
-- That leaves the single most common thing a small business actually does.
-- Somebody has a quiet week, or a customer who can only make evenings, and
-- they will happily stay until nine once — but the assistant has no way to
-- know, so it turns that customer away on the owner's behalf. Out of hours is
-- exactly when the assistant is answering, which makes it the worst possible
-- gap.
--
-- Dated rather than recurring, because that is the whole point: it applies to
-- one day and then it is gone.
--
--   [{ "date": "2026-09-11", "open": "17:00", "close": "21:00" }]
alter table artists
  add column if not exists extra_hours jsonb not null default '[]'::jsonb;

comment on column artists.extra_hours is
  'One-off working hours for a specific date, widening that day for this person only. Cleared by hand or when the date passes.';
