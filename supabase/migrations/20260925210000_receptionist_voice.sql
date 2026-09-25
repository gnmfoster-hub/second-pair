-- How the Receptionist opens, and which voice says it.
--
-- Not run yet. Both are nullable and absent means the default, so running it
-- changes nothing about how any call is answered.
--
-- Giles, after the first real call: "with this there would need to be some
-- added tailoring from the businesses."
--
-- Two things a business would actually want to change, and no more than two.
--
-- ── The greeting ───────────────────────────────────────────────────────────
--
-- "Hello, Neat and Tidy Solutions. How can I help?" is right for most, and
-- wrong for anybody who answers their phone differently — a one-man trade who
-- says "Morning, Dave speaking", a salon that says which branch. It is the
-- first thing a caller hears and the only sentence they will judge before
-- deciding whether this is worth their time.
--
-- Deliberately short, and the screen says so. A greeting is the one place a
-- business will write a paragraph, and a paragraph is the thing callers talk
-- over.
--
-- ── The voice ──────────────────────────────────────────────────────────────
--
-- One column, holding a Twilio voice name. British by default because the
-- businesses are, and offered as a small list rather than a free field: a
-- typo here is a call that fails to speak at all, and Twilio does not tell us
-- in advance.
--
-- Everything else about how it talks is already tailorable and already applies
-- on the phone, because the phone uses the same assistant as the texts: tone
-- of voice, house rules, never-say and always-get-me are all on the Assistant
-- settings and reach every channel. Adding a second set for the telephone
-- would be a second set to keep in step.

alter table studios
  add column if not exists receptionist_greeting text;

alter table studios
  add column if not exists receptionist_voice text;

comment on column studios.receptionist_greeting is
  'The first thing the Receptionist says. Null means the default, which is the business name and an offer of help. Kept short on purpose: a caller talks over a paragraph.';

comment on column studios.receptionist_voice is
  'Which Twilio voice speaks. Null means the house default, Polly.Amy-Neural. Chosen from a list rather than typed: an unknown name is a call that does not speak.';
