-- The day's diary, emailed every morning to whoever asked for it.
--
-- One statement. Safe to run twice.
--
-- Giles, 15 October: "can we have a daily brief that clients can switch on or
-- off, it will be send to the primary person so individual workers if they are
-- set up seperate or the owner if not. This will include a run down of the
-- days diary including everything in case they dioont log into the diary."
--
-- Off for everybody until they tick the box on Settings, Reminders. A product
-- that starts emailing a business every morning without being asked has
-- decided something on their behalf, and the first one arrives at seven.
--
-- daily_brief_sent_on is the claim, exactly as weekly_report_sent_on is. The
-- job that sends these rides on the sweep, the sweep runs every few minutes,
-- and without a claimed day a business would get the same email every time it
-- ran. A date rather than a timestamp because the question is only ever
-- "has today's gone yet".

alter table studios
  add column if not exists daily_brief_email boolean not null default false,
  add column if not exists daily_brief_sent_on date;
