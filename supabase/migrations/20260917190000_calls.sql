-- Somewhere to write down what a phone call actually was.
--
-- The telephone is the only channel with more than one meter running. A text
-- is one price for one message; a call bills the leg in, the leg out to the
-- owner's mobile, the recording and the transcription — four rates, three of
-- them per minute and every one rounded up to a whole minute per leg.
--
-- None of it has ever been counted. Forwarding a missed call to a mobile has
-- been costing us since the day it was built, on every business with a ring-me
-- number, and it appears nowhere: not on the billing page, not in the reports,
-- not in the per-channel costs. A cost you cannot see is a cost you cannot
-- price, and the whole question is what to charge for the telephone.
--
-- So: a row per call, with the seconds each leg ran for. Durations and
-- outcomes only — no recording, no transcript, no words. What was said lives
-- in the conversation like any other message, and the recording itself is
-- deleted from Twilio the moment it has been read.

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,

  -- The caller, so a call can be tied to the conversation it started.
  -- Their number is already on that conversation; this is the same fact.
  from_number text,

  -- The line they rang, because a business can have more than one.
  to_number text,

  -- Twilio's own id, so a retried webhook updates the row it already wrote
  -- rather than adding a second one.
  call_sid text unique,

  -- How long the owner's mobile rang. The dear leg: a UK mobile runs about
  -- six times the inbound rate, and fifteen seconds of it bills as a minute.
  rang_seconds integer not null default 0,

  -- Whether that leg went out at all. A business with no ring-me number has
  -- its callers texted straight away and we pay for one leg, not two.
  forwarded boolean not null default false,

  -- Whether a person picked it up. An answered call is the cheapest outcome
  -- for us and the best one for them, and worth being able to count.
  answered boolean not null default false,

  -- The message, if they left one, and whether those words were transcribed.
  recorded_seconds integer not null default 0,
  transcribed boolean not null default false,

  at timestamptz not null default now()
);

comment on table calls is
  'One row per inbound call: durations and outcomes only, never words. Priced in src/lib/voice/callCost.ts.';

-- Counting a month of them, per business, which is the only query this has.
create index if not exists calls_studio_at_idx on calls (studio_id, at desc);

alter table calls enable row level security;

-- Nobody reads these through the browser. The nightly meter and the back
-- office use the service key; a business sees the conversation, not the
-- carrier's meter, and there is no screen that needs a customer's call log.
