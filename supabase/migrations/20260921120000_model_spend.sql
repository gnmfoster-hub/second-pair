-- What the model actually cost, kept where nothing can tidy it away.
--
-- Every figure this product shows about model spend is read back out of
-- messages.usage, and that is not where the money went. It is a note attached
-- to a reply, and a reply is deleted when its conversation is:
--
--   * every check in scripts/ writes real enquiries to a demo and clears them
--     up afterwards, which deletes the messages and the cost with them;
--   * a conversation thrown away from the inbox takes its replies too;
--   * erasing a client is designed to take the words away.
--
-- And on top of that, both the meter and the cost report deliberately skip
-- conversations marked is_test, because "your assistant answered 14 enquiries"
-- is worthless if nine were the owner rehearsing. That is right for a business
-- report and wrong for a bill: Anthropic charges for the rehearsal.
--
-- So the product said £2.14 of model spend across the whole platform for a
-- month, and the Anthropic credit was running out. Both were true. The nine
-- tenths that had been deleted were the answer, and there was no way to see it
-- from any screen.
--
-- This is the durable half. One row per model turn, written as the turn ends,
-- never deleted with a conversation and never filtered for being a test. The
-- business-facing figures go on reading messages.usage and go on excluding
-- rehearsals, which is correct for them. This is the one that reconciles with
-- the invoice.

create table if not exists model_spend (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),

  -- Nullable and deliberately not a foreign key. The whole point is that this
  -- row outlives the conversation, so it must not be cascaded away with it,
  -- and a studio deleted in the back office should not take its own bill with
  -- it either.
  studio_id       uuid,
  studio_slug     text,
  conversation_id uuid,

  channel         text,

  -- Whether this was somebody rehearsing or a check running, rather than a
  -- customer. Excluded from what a business is shown, included in what we pay.
  is_test         boolean not null default false,

  model           text,
  cost_micros     integer not null default 0,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cache_read      integer not null default 0,
  cache_write     integer not null default 0,
  -- How many times round the model went for this one reply. Two or three is
  -- ordinary; eight is the ceiling and worth seeing.
  rounds          integer not null default 1
);

create index if not exists model_spend_at on model_spend (at desc);
create index if not exists model_spend_studio on model_spend (studio_id, at desc);

comment on table model_spend is
  'One row per model turn, kept whatever happens to the conversation. The only figure here that reconciles with the Anthropic invoice; everything a business is shown comes from messages.usage instead and excludes rehearsals.';
