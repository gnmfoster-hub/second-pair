-- Marketing, per channel, and a way for the customer to change it themselves.
--
-- There was one tick — "agreed to marketing" — with the date and how it was
-- given, which is most of what PECR asks for and not all of it. Two things
-- were missing:
--
--   * Which channel. Agreeing to an email about an offer is not agreeing to a
--     text, and the rules treat them separately.
--   * A way to withdraw it as easily as it was given. That is the customer's
--     right, and "ring the salon and ask" is not it.
--
-- So: a preference per channel, and a long random token that addresses a page
-- where they set their own. The token is the credential, like the form links
-- and the calendar feeds — it says nothing about them if it is seen.
--
-- Reminders and confirmations are not marketing and are unaffected: they are
-- about an appointment somebody asked for.

alter table contacts
  add column if not exists marketing_email boolean not null default false,
  add column if not exists marketing_sms boolean not null default false,
  add column if not exists marketing_token text;

-- Filled for everybody who already exists, and by default from here on.
update contacts set marketing_token = new_calendar_token() where marketing_token is null;

alter table contacts alter column marketing_token set default new_calendar_token();
alter table contacts alter column marketing_token set not null;

create unique index if not exists contacts_marketing_token_key on contacts (marketing_token);

-- What was already agreed carries over, as email: it is the channel every one
-- of those ticks was collected for.
update contacts set marketing_email = true where marketing_consent = true;

comment on column contacts.marketing_email is
  'May be sent marketing by email. Reminders and confirmations are not marketing.';
comment on column contacts.marketing_sms is
  'May be sent marketing by text.';
comment on column contacts.marketing_token is
  'Addresses their own preferences page, so they can change it without asking.';
