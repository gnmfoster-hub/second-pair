-- The commercial side of a customer, which is Second Pair's business and not
-- theirs.
--
-- Kept on the studio rather than in a separate table: there is exactly one of
-- these per business, it is read on almost every admin screen, and a join for a
-- one-to-one relationship buys nothing.
--
-- Nothing here is visible to the business itself. It is what they pay, how many
-- people they are entitled to, and what state the account is in.

alter table studios
  -- What they are on. Free text rather than an enum: the plans will change more
  -- often than the schema should.
  add column if not exists plan text,

  -- Pence per month, so no floating point anywhere near money.
  add column if not exists plan_pence int not null default 0,

  -- How many people they may have. Null means no limit, which is what every
  -- existing business gets so nothing breaks the day this lands.
  add column if not exists seat_limit int,

  add column if not exists account_status text not null default 'trial'
    check (account_status in ('trial', 'active', 'overdue', 'paused', 'closed')),

  -- When they started paying, for the anniversary and for how long they stayed.
  add column if not exists billing_started_on date,

  -- Anything a person needs to remember before ringing them.
  add column if not exists account_note text;

comment on column studios.seat_limit is
  'Maximum active people. Null means unlimited. Enforced when somebody is added.';
comment on column studios.plan_pence is
  'What this business pays per month, in pence.';
