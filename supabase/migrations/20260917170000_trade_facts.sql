-- The few things a trade keeps about a customer that nothing else does.
--
-- A groomer's vaccination expiry, a garage's MOT date, a driving pupil's theory
-- pass. We have asked these questions in conversation since August — the packs
-- have always known a groomer needs the breed — but the answers landed in a
-- paragraph of free text, where nothing could act on them. A date nobody can
-- compare is not a date, it is a sentence.
--
-- Typed and stored against the customer, so a vaccination that has run out can
-- stop a booking and an MOT can be mentioned before the DVSA mentions it.
--
-- One jsonb column rather than a column per trade: the shape belongs to the
-- trade pack, which changes far more often than a schema should, and no
-- business ever needs another business's fields.

alter table contacts
  add column if not exists trade_facts jsonb not null default '{}'::jsonb;

comment on column contacts.trade_facts is
  'Typed facts defined by the business''s trade pack — vaccination expiry, MOT due, theory pass. See src/lib/tradeFacts.ts.';

-- Finding everybody whose date falls due, without reading every customer.
create index if not exists contacts_trade_facts_idx on contacts using gin (trade_facts);

-- And the switch for the reminders those dates make possible.
--
-- On by default: a garage that has typed an MOT date into a customer's record
-- has said what it wants, and a reminder nobody asked for is the one thing a
-- garage would rather we got wrong in that direction. Off is one tick away.

alter table studios
  add column if not exists fact_reminders boolean not null default true;

comment on column studios.fact_reminders is
  'Whether to text customers before a trade date falls due — MOT, theory pass, exam. See src/lib/sayWhatsDue.ts.';
