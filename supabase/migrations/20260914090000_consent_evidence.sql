-- When somebody agreed to be marketed to, and how.
--
-- There is a boolean for this and a checkbox that sets it, and under PECR a
-- boolean is not consent. What is required is evidence: when it was given, by
-- what means, and what the person was told at the time. "Somebody ticked a box
-- in our system at some point" is what a business has today, and it is exactly
-- what the ICO says is not enough if it is ever asked.
--
-- Nothing in this product sends marketing yet, which is the right moment to
-- get this right — the alternative is a year of ticks nobody can date, and a
-- list that cannot lawfully be used at the moment somebody wants to use it.
alter table contacts
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_source text;

comment on column contacts.marketing_consent_at is
  'When they agreed. Null with marketing_consent true means it predates this column and cannot be evidenced.';
comment on column contacts.marketing_consent_source is
  'How it was given: who recorded it, or that the customer did it themselves.';

/*
 * Existing ticks are left exactly as they are, and deliberately not backdated.
 *
 * Writing today's date onto consent given at some unknown point would be
 * inventing the evidence rather than recording it, which is worse than having
 * none — it would look defensible and would not be. They read as "agreed, date
 * unknown", which is the truth and which the screen now says.
 */
