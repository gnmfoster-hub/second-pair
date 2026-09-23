-- Letting a business say "that one is fine as it is".
--
-- Not run yet. Everything shipped alongside it degrades to "nothing
-- dismissed", which is exactly how the panel behaves today.
--
-- The readiness panel tells a business what the assistant cannot do yet, and
-- some of what it says is advice rather than fault. Giles, on the consultation
-- one: if I do not want to adjust the time there should be a way of getting
-- rid of it. He is right — a warning with no way to answer it is a warning
-- that gets ignored along with everything beside it, which is how a genuinely
-- broken thing ends up unread in a list of things somebody has decided to live
-- with.
--
-- An array of capability keys rather than a row per dismissal. There are a
-- dozen keys, the list is read on every dashboard load and written rarely, and
-- it belongs to the business rather than to a person — one owner dismissing it
-- should not leave the next one looking at it.
--
-- Only advice can be dismissed, and that is enforced in the code rather than
-- here: anything actually stopping the assistant answering keeps its row
-- whatever is in this column. A business must not be able to hide the fact
-- that nobody can book.

alter table studios
  add column if not exists readiness_dismissed text[] not null default '{}';

comment on column studios.readiness_dismissed is
  'Readiness checks this business has said are fine as they are. Advice only: blocking checks ignore it.';
