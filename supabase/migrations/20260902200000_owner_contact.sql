-- How to reach the person who runs a business, and when their trial ends.
--
-- The email is already on their login, but an email address is not how you ring
-- somebody whose diary has stopped working on a Saturday. And a trial with no
-- end date is not a trial, it is a free account nobody remembers to convert.
alter table studios
  -- Who to ask for. The login carries a name only if one was typed when the
  -- account was made, and that is often not the person who answers the phone.
  add column if not exists owner_name text,
  add column if not exists owner_phone text,

  -- Null means no trial: either they pay already, or the arrangement is
  -- something else. Never assume a date nobody set.
  add column if not exists trial_ends_on date;

comment on column studios.owner_phone is
  'For ringing them. Not shown to anybody but the platform administrator.';
comment on column studios.trial_ends_on is
  'When the trial runs out. Null means there is not one.';
