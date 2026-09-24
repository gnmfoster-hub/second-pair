-- What the Receptionist may do on its own, and what needs a person.
--
-- Not run yet. Both columns default to the careful answer, so running it
-- changes nothing for anybody: every business starts with phone bookings held
-- for confirmation, which is the state a business would choose on day one.
--
-- Giles, asked whether it should book: "can it book but have a confirm setting
-- for deposits and making sure its all ok."
--
-- That is the right shape and it is not the same question twice.
--
-- ── Why booking on the phone is different ───────────────────────────────────
--
-- Over text the customer types their own name and reads back the time. On the
-- phone the assistant hears them, and hearing is where this goes wrong: a name
-- misheard is a stranger in the diary, and "half past" heard as "half past
-- two" when they said "half past ten" is somebody turning up to a closed shop.
-- The text assistant has never had that failure mode.
--
-- So a phone booking can land held rather than confirmed. The slot is taken —
-- which is the point, nobody else gets it — and it carries the same hold the
-- diary already draws with a clock on it, until a person looks at it. That
-- costs the business a glance and removes the one failure the phone adds.
--
-- ── And the deposit, separately ─────────────────────────────────────────────
--
-- Reading a payment link out over the phone does not work, so the deposit is
-- texted afterwards. Whether to ask for one at all on a call the business has
-- not yet heard is a second decision: a deposit request that arrives before
-- anybody has checked the booking is a customer being asked for money for an
-- appointment that may be wrong.
--
-- Both default to the cautious setting. A business that finds it reliable can
-- switch either off; nobody has to switch anything on to be safe.

alter table studios
  add column if not exists receptionist_holds boolean not null default true;

alter table studios
  add column if not exists receptionist_asks_deposit boolean not null default false;

comment on column studios.receptionist_holds is
  'A booking made on the phone is held for a person to confirm rather than confirmed outright. On by default: hearing is where a phone booking goes wrong, and the diary already draws a hold with its clock.';

comment on column studios.receptionist_asks_deposit is
  'The Receptionist may text a deposit link after the call. Off by default: asking for money for a booking nobody has checked is the wrong order.';
