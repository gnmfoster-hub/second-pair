-- What each channel cost, kept beside the month's totals.
--
-- The month already records texts out, texts in, emails and what the model
-- charged. Adding them together and calling it "messaging" hides the only fact
-- worth having: which channel is expensive, and therefore what a channel is
-- worth charging for. A text is 4p and a website chat is nothing, and until
-- this column existed the bill could not tell them apart.
--
-- One jsonb rather than a column per channel, because channels arrive. Voice
-- turned out to need five numbers of its own — calls, and four kinds of minute
-- — and a schema change per channel is how a billing table stops being edited.
--
-- Written as a file after the fact. This column was pasted into the database
-- by hand from a worklist and never existed as a migration, so a fresh
-- database built from this folder came up without it and the check that says
-- which migrations are outstanding could not see it at all. Harmless to run
-- again where it has already been applied.

alter table usage_months
  add column if not exists by_channel jsonb;

comment on column usage_months.by_channel is
  'Per-channel usage for the month: messages out and in, conversation-days, model micros, and for voice the calls and minutes. Priced in src/lib/billing.ts.';
