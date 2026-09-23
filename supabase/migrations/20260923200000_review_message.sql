-- The review request, in the business's own words.
--
-- Not run yet. Until it is, the wording is the built-in one exactly as it is
-- today — reviewMessage() is the fallback, not a duplicate of it.
--
-- Confirmations and reminders have been the business's own sentence since they
-- were built, editable with a preview and a character count. The review
-- request was not: reviews.ts composes "Hi Kaz — hope everything went well
-- with your BIAB yesterday. If you have a minute, a quick review really helps
-- Pure Nails" and only the link was theirs to choose.
--
-- Which means every business on the platform sends the identical sentence. It
-- reads well for a salon and oddly for a plastering firm, and it is the one
-- message that asks a customer for a favour — the place where sounding like
-- the person who did the work matters most.
--
-- Null means "use the built-in one", which is not the same as an empty string.
-- A business that deletes every character has said something different from a
-- business that has never opened the screen, and silently reinstating our
-- wording for the first one would be putting words in their mouth.

alter table studios
  add column if not exists review_message text;

comment on column studios.review_message is
  'The review request in the business own words. Null means the built-in wording; empty means they cleared it.';
