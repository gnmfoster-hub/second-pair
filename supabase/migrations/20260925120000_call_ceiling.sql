-- A ceiling on calls, the way there is one on texts.
--
-- Not run yet. Nothing changes until it is, and nothing changes after it
-- either until a number is typed into the box: null means no ceiling, which is
-- every business today.
--
-- Giles: "give limits on texts and calls if required."
--
-- ── What a ceiling must not do ──────────────────────────────────────────────
--
-- The text ceiling stops texts. That is safe, because the message still goes
-- by email — the point of the ceiling is to stop the spend, not the message.
--
-- A call cannot work that way. Somebody is ringing a business right now, and
-- the ways to "stop" that are all bad: refuse the call, which is the worst
-- thing this product could do to a customer; or answer and say we cannot help,
-- which is worse still because it sounds like the business saying it.
--
-- So this ceiling stops the expensive half instead. A call has four legs and
-- the dear one by a distance is the outbound leg to the owner's mobile — a
-- whole minute billed at roughly six times the inbound rate, every time
-- anybody rings, whether or not it is answered. Past the ceiling that leg
-- stops: the call is still answered, the caller is still texted back within
-- seconds, a message can still be left. What stops is us ringing a mobile.
--
-- The customer's experience is the same on the day the ceiling is hit as it is
-- for every business that has ring-me empty by choice, which is a real and
-- common setting rather than a degraded one.
--
-- Counted per calendar month against calls.at, same as the texts.

alter table studios
  add column if not exists call_monthly_cap integer;

comment on column studios.call_monthly_cap is
  'Stop forwarding calls to a mobile past this many calls a month. Null means no ceiling. Calls are still answered and still texted back — only the expensive outbound leg stops.';
