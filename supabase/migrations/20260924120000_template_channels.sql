-- Which channel one particular reminder goes out on.
--
-- Not run yet. Every template defaults to "whatever the business chose", which
-- is exactly what happens today, so running it changes nothing.
--
-- Giles: be able to set templates for both in settings, so you can set a
-- reminder up and select send both, if it is switched on in the back end by me.
--
-- Two halves, and the second is the point. studios.message_channels already
-- says how a business sends in general; this lets one template differ from it,
-- because they are genuinely different messages. The day-before reminder is
-- the one people expect as a text. The aftercare note that follows a tattoo is
-- four paragraphs and belongs in an email. Making a business choose one answer
-- for both is making them choose which of the two to get wrong.
--
-- And "both" costs money every time, which is why it is an entitlement rather
-- than a free choice: a business that picks it doubles its text bill, and that
-- should be a conversation with Giles rather than a dropdown nobody priced.
-- Off for everybody until he switches it on, and the option is not offered on
-- a screen where it cannot be chosen — a disabled control that says "ask us"
-- is an advert; one that is simply absent is a product that knows what it
-- sells.

alter table reminder_templates
  add column if not exists channels text not null default 'default';

alter table reminder_templates
  drop constraint if exists reminder_templates_channels_check;

alter table reminder_templates
  add constraint reminder_templates_channels_check
  check (channels in ('default', 'email', 'sms', 'both'));

alter table studios
  add column if not exists allow_both_channels boolean not null default false;

comment on column reminder_templates.channels is
  'How this one goes out. "default" follows studios.message_channels. "both" needs studios.allow_both_channels.';

comment on column studios.allow_both_channels is
  'Whether this business may choose to send a message by email AND text. Charged: it doubles the texts.';
