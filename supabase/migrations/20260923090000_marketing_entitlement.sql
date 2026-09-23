-- Marketing, as something switched on per business from the back office.
--
-- Not run yet. Giles runs migrations by hand in the Supabase SQL editor, and
-- everything shipped alongside this degrades to "off" until it does — see
-- marketingPlan.ts, which treats an absent column as not switched on.
--
-- Why an entitlement rather than a setting the business ticks for itself.
-- Giles: "an option for email and text marketing but with the ability to turn
-- it on and off for all in the back end so i can charge, as text marketing
-- will be expensive." Both halves of that matter.
--
-- Text marketing costs real money per message and email costs almost nothing,
-- so they are two switches rather than one. A business that pays for email
-- campaigns should not silently acquire the ability to send a thousand texts.
--
-- And they are ours to set, not the business's, which is why they live here
-- rather than on the settings screen. A business can already decide who it
-- writes to and what it says; this decides whether it is buying the feature at
-- all. The same reason there is nowhere in the app to type the Stripe Connect
-- key: a box on a settings page implies it is the business's to change.
--
-- Consent is untouched and unaffected. These say a business MAY run campaigns;
-- contacts.marketing_email and marketing_sms still say whether a particular
-- person has agreed to receive them, with the dated evidence PECR asks for.
-- Switching this on gives nobody permission to write to anybody who has not
-- opted in, and nothing in the product reads one as the other.
--
-- Reminders and confirmations are not marketing and are not affected by
-- either of these. They are service messages about an appointment somebody
-- has booked, which is exactly the distinction the marketing_preferences
-- migration drew when those columns were added.

alter table studios
  add column if not exists marketing_email_on boolean not null default false,
  add column if not exists marketing_sms_on boolean not null default false;

comment on column studios.marketing_email_on is
  'We have switched email marketing on for this business. Not consent: see contacts.marketing_email.';

comment on column studios.marketing_sms_on is
  'We have switched text marketing on for this business. Charged, because texts cost per message.';
