-- What a Receptionist call actually costs, which nothing has ever counted.
--
-- Not run yet. Every column is nullable and every one defaults to nothing, so
-- running it changes no figure anywhere until calls start writing to it.
--
-- ── Why this is missing ─────────────────────────────────────────────────────
--
-- The calls table was built for the answerphone, and it measures the
-- answerphone exactly: the leg in, the leg out to a mobile, the recording and
-- the transcription. Four clocks.
--
-- The Receptionist is not that shape. It holds a conversation — every word it
-- says is synthesised and billed by the character, and every word it hears is
-- charged by the minute for speech recognition. Neither is a clock on a leg,
-- and neither existed when this table was written.
--
-- Worse, a Receptionist call was not written to this table at all. The row is
-- created by the missed-call webhook, and a line that picks up never reaches
-- that path. So the single most expensive thing this product does — the thing
-- being sold as a priced add-on — appeared nowhere: not on the billing page,
-- not in any report, not in the monthly call cap it is supposed to obey.
--
-- ── And it just got dearer, deliberately ────────────────────────────────────
--
-- Giles, after a test call: "it wasnt the best voice etc it needs improving."
--
-- Twilio bills text to speech in three tiers. The Receptionist has moved from
-- the middle one to the top one, which is four times the price and sounds like
-- a person rather than a machine. About 12p of talking on a six-turn call
-- instead of 3p.
--
-- That is the right trade — on a call the voice is not part of the experience,
-- it is the whole of it — and it is exactly the kind of decision that must not
-- be made invisibly. His condition was "re-cost it". This is that.

alter table calls
  add column if not exists spoken_characters integer not null default 0;

alter table calls
  add column if not exists spoken_tier text;

alter table calls
  add column if not exists listened_seconds integer not null default 0;

-- Which line answered it: the Receptionist, or the answerphone as before.
-- Derivable from spoken_characters being above nought, but only by knowing
-- that rule, and a column somebody can group by is worth more than a rule.
alter table calls
  add column if not exists answered_by text;

comment on column calls.spoken_characters is
  'Characters the Receptionist spoke across the whole call. Billed by the character, not the minute — the one meter on a call that is not a clock. Nought on a missed call, whose own sentences are already priced into the inbound leg.';

comment on column calls.spoken_tier is
  'Which text-to-speech tier said them: "generative" or "neural". Four times the price between the two, so the total cannot be worked out without it.';

comment on column calls.listened_seconds is
  'How long the conversation ran, from the first turn to the last, in seconds. Measured as the gap between turns rather than by asking Twilio, which never reports it — so it is the whole interval (our thinking, the voice playing, the caller speaking) and is therefore an upper bound on recognition and an honest figure for how long the caller was connected. Named for what it is charged as, not for what it perfectly measures.';

comment on column calls.answered_by is
  'What picked up: "receptionist" for a line that talked, "answerphone" for the texted-back missed call, null for rows written before this existed.';
