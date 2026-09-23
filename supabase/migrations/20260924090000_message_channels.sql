-- Which channel a message to a customer goes out on, and a ceiling on texts.
--
-- Not run yet. The default is exactly what happens today, so running it
-- changes nothing for anybody until a business is moved off it.
--
-- Giles: can the settings on all communications be email first, then text if
-- email is not available, both if we have the details, with the option to turn
-- one or the other off. And: I do not want to not send text reminders, that
-- feels like something customers expect.
--
-- Both of those are true at once, which is why this is a choice rather than a
-- rule. A text is what people expect and it costs money every time; an email
-- costs nothing and carries the whole message, a link and a layout. Which
-- trade a business wants is theirs.
--
--   as_they_came  whichever channel the customer arrived on. What happens
--                 today, and the default, so no live business changes
--                 underneath itself the day this runs.
--   both          email and text, where we hold both details. The most
--                 expensive and the most certain to be seen.
--   email_first   email where there is an address, text where there is not.
--                 The cheap one.
--   email_only    never text. For a business that does not want the cost.
--   sms_only      never email.
--
-- Reminders, confirmations and review requests. Not campaigns: a campaign
-- names its own channel, because that is a decision with a price attached and
-- it is made once, visibly, per campaign.
--
-- And a ceiling, which is the other half of what he asked for. texts_included
-- already exists and is a billing allowance — how many are in the plan before
-- overage is charged. This is different and blunter: a number past which we
-- stop sending, so a loop, an import or a busy fortnight cannot run up a bill
-- nobody agreed to. Null means no ceiling, which is every business today.

alter table studios
  add column if not exists message_channels text not null default 'as_they_came',
  add column if not exists sms_monthly_cap integer;

alter table studios
  drop constraint if exists studios_message_channels_check;

alter table studios
  add constraint studios_message_channels_check
  check (message_channels in ('as_they_came', 'both', 'email_first', 'email_only', 'sms_only'));

comment on column studios.message_channels is
  'How reminders, confirmations and review requests choose a channel. Campaigns name their own.';

comment on column studios.sms_monthly_cap is
  'Stop sending texts past this many in a calendar month. Null means no ceiling. Not a billing allowance: see texts_included.';
