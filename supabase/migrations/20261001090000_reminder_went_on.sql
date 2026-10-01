-- Where a reminder went, when it went to more than one place.
--
-- reminders.channel is the channel enum, so it holds one channel and only a
-- channel. The sender was writing "email, sms" into it on a two-channel send,
-- which Postgres refuses outright, which threw away the whole record of a
-- message that had already gone out and left the row pending to be sent again.
--
-- Plain text on purpose. It is a record of what happened, not something queried
-- or constrained, and the enum is exactly what made the old shape fail.
alter table reminders add column if not exists went_on text;

comment on column reminders.went_on is
  'Every channel this went on, comma separated, where there was more than one. channel holds the one whose wording is in body.';
