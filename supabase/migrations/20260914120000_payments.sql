-- Taking money, and being able to account for it afterwards.
--
-- Deposits already work: a Checkout session on the business's own connected
-- account, so money never rests with Second Pair and we stay out of the
-- regulation that comes with holding other people's. Everything here is built
-- on that same footing.
--
-- Two things this adds. A record of every transaction that is ours rather than
-- Stripe's, so somebody can be handed a file at the end of a quarter without
-- logging into anything. And the choice of whose account the money lands in,
-- because a salon with employees and a salon of chair renters are different
-- businesses wearing the same trade.

-- ─────────────────────────────────────────────────── whose account, and who may

/*
 * Which model this business uses.
 *
 * "business" is one Stripe account for the shop: everybody's takings land
 * there and the owner settles up however they already do. "people" is a Stripe
 * account each: their money never touches the shop's.
 *
 * Defaulted to business, which is what every business does today, so nothing
 * changes for anybody until somebody chooses otherwise.
 */
alter table studios
  add column if not exists payment_model text not null default 'business'
    check (payment_model in ('business', 'people'));

comment on column studios.payment_model is
  'business = one Stripe account for the shop. people = a connected account per person, for a salon where every chair is its own business.';

/*
 * Whether this business may take payments at all, separately from deposits.
 *
 * Two switches rather than one because they are genuinely different questions:
 * plenty of trades take a deposit and invoice the rest, and plenty take the
 * whole thing on the day and never hold a deposit.
 *
 * Off by default. Nothing starts charging anybody because a migration ran.
 */
alter table studios
  add column if not exists takes_payments boolean not null default false;

comment on column studios.takes_payments is
  'Whether the full amount can be charged, as opposed to only a deposit. Off until somebody turns it on.';

-- And the same two questions for each person, plus their own account.
alter table artists
  add column if not exists stripe_account_id text,
  add column if not exists takes_deposits boolean not null default true,
  add column if not exists takes_payments boolean not null default true;

comment on column artists.stripe_account_id is
  'Their own connected account, used only where the business pays people directly. Null means they cannot be paid that way yet.';
comment on column artists.takes_deposits is
  'Whether this person may take a deposit. On by default; the business-level switch still has to allow it.';
comment on column artists.takes_payments is
  'Whether this person may take a full payment. On by default; the business-level switch still has to allow it.';

-- ───────────────────────────────────────────────────────────── the record

/*
 * Every transaction, as we saw it.
 *
 * Stripe is the source of truth for the money and this is the source of truth
 * for the business: what it was for, who took it, which client it belongs to.
 * Somebody doing a tax return needs gross, fee and net in one place per person,
 * and needs it without a Stripe login.
 *
 * Kept even when a booking is deleted. A refund six weeks later still has to
 * be explicable, and a payment that vanishes with its appointment is a hole in
 * somebody's accounts.
 */
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,

  -- Whose takings these are. Null only where we genuinely cannot tell.
  artist_id     uuid references artists(id) on delete set null,
  contact_id    uuid references contacts(id) on delete set null,
  booking_id    uuid references bookings(id) on delete set null,

  -- A deposit, the balance, or something sold over the counter.
  kind          text not null default 'payment'
    check (kind in ('deposit', 'payment', 'product', 'refund')),

  /*
   * Money, in integer pence, exactly as Stripe reports it.
   *
   * Gross is what the customer paid. Fee is Stripe's. Net is what actually
   * arrives, and it is stored rather than derived because Stripe's arithmetic
   * is the one an accountant will check against.
   */
  gross_pence   integer not null,
  fee_pence     integer,
  net_pence     integer,
  currency      text not null default 'gbp',

  -- How it was taken, for somebody reconciling against a card machine.
  method        text,

  status        text not null default 'paid'
    check (status in ('pending', 'paid', 'refunded', 'failed')),

  -- What it was for, in the business's own words, on the file they download.
  description   text,

  /*
   * Stripe's own references, so any row here can be found at their end.
   * Unique on the session so a webhook delivered twice records one payment —
   * a retry is normal and a double entry in somebody's accounts is not.
   */
  stripe_session_id        text unique,
  stripe_payment_intent_id text,

  /** Which account it landed in, so a per-person model can be audited. */
  destination_account text,

  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists payments_studio_idx on payments (studio_id, paid_at desc);
create index if not exists payments_artist_idx on payments (artist_id, paid_at desc);
create index if not exists payments_booking_idx on payments (booking_id);

alter table payments enable row level security;

/*
 * Anybody in the business may read them; only the owner may change one.
 *
 * A stylist needs to see what she took — it is the whole point of the per
 * person export — and nobody needs to hand-edit a payment, which is why there
 * is no write policy for staff at all. Corrections happen through a refund,
 * which is a real event with its own row.
 */
drop policy if exists payments_read on payments;
create policy payments_read on payments for select
  using (is_studio_member(studio_id));

drop policy if exists payments_owner on payments;
create policy payments_owner on payments for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));
