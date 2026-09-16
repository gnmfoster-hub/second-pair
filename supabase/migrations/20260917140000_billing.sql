-- Metering and billing: what each business used, and what we paid out.
--
-- Two problems this solves. The first is that usage is currently worked out by
-- counting messages, and messages are thrown away by data retention — so a bill
-- queried in February cannot be rebuilt from January's conversations, because
-- they are gone. A month's figures are written down once and kept.
--
-- The second is that what the suppliers charge lives on invoices nobody can
-- read from here. platform_costs is somewhere to type them in as they are paid,
-- so the margin on a month is a real number rather than an assumption.
--
-- Nothing here is visible to a business. It is Second Pair's own book.

-- What the plan actually covers. plan and plan_pence already exist.
alter table studios
  -- Texts the monthly price covers. Null means unlimited.
  add column if not exists texts_included int default 300,
  -- What each text past the bundle costs them, in pence.
  add column if not exists text_overage_pence int not null default 8;

comment on column studios.texts_included is
  'Texts we send on their behalf that the monthly price covers. Null is unlimited.';

create table if not exists usage_months (
  studio_id     uuid not null references studios(id) on delete cascade,
  -- Always the first of the month, so a month means one thing everywhere.
  month         date not null,

  -- Texts we sent for them: assistant replies and reminders. What the bundle
  -- is counted against.
  texts_out     int  not null default 0,
  -- Texts their customers sent in. Costs us money, never billed on.
  texts_in      int  not null default 0,
  emails_out    int  not null default 0,
  -- What the model charged, in millionths of a pound, summed off the turns.
  model_micros  bigint not null default 0,

  -- How the month was priced, copied in at the time. A plan that changes in
  -- March must not silently rewrite February's invoice.
  plan_pence         int not null default 0,
  texts_included     int,
  text_overage_pence int not null default 0,

  -- What we decided they owe, once the month is closed.
  billed_pence  int,
  billed_at     timestamptz,
  note          text,

  updated_at    timestamptz not null default now(),
  primary key (studio_id, month)
);

comment on table usage_months is
  'One row per business per month: what they used, how it was priced, what they were billed.';

create index if not exists usage_months_month_idx on usage_months (month desc);

-- What we pay, typed in as the invoices arrive.
create table if not exists platform_costs (
  id         uuid primary key default gen_random_uuid(),
  month      date not null,
  supplier   text not null,
  pence      int  not null,
  note       text,
  created_at timestamptz not null default now()
);

comment on table platform_costs is
  'Supplier invoices — Vercel, Supabase, Twilio, Anthropic, the domain. Second Pair''s own outgoings, per month.';

create index if not exists platform_costs_month_idx on platform_costs (month desc);

-- Both are ours alone. No business, and nobody signed in as one, may read a
-- word of either: row level security on with no policy at all means only the
-- service role reaches them, which is what the admin screens use.
alter table usage_months   enable row level security;
alter table platform_costs enable row level security;
