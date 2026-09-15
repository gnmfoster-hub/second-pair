-- The weekly report by email, which the product has always promised and never sent.
--
-- Off until the owner turns it on, from the report page. The date is how the
-- job that runs every few minutes sends it once on a Monday rather than
-- every time it wakes up.

alter table studios
  add column if not exists weekly_report_email boolean not null default false,
  add column if not exists weekly_report_sent_on date;

comment on column studios.weekly_report_email is
  'Whether the owners get last week''s report by email on Monday morning.';
