-- Campaigns: a message to people who had a particular job, a while afterwards.
--
-- Not run yet. Nothing sends until it exists, and the settings screen says so
-- rather than failing with a table name.
--
-- Giles asked for marketing options on reminders: send people something so
-- long after a booking, pulling what the booking was, from templates, and a
-- way of sending offers out.
--
-- Shaped as "so long after a job" rather than as a mailing list on purpose.
-- A list is a thing somebody has to remember to use, and the businesses this
-- is for are one person with their hands full. "Six weeks after a colour, ask
-- if they want another" runs itself, is obviously useful, and is the thing a
-- salon would actually pay for.
--
-- Matching on the job's NAME rather than an id, because bookings have no
-- service_id — the link has always been the title text, which is copied from
-- the service when it is booked. That is a real constraint and worth writing
-- down rather than discovering later: renaming a service stops matching past
-- bookings, and the screen says which job it will match so nobody has to guess.
--
-- One channel per campaign, not a list of them. Texts cost per message and
-- email costs almost nothing, so "send this by text" is a decision with a
-- price attached and should be made once, visibly, per campaign — rather than
-- as a checkbox somebody ticks twice and pays for monthly.
--
-- What is deliberately NOT here: who has been sent what. That is
-- handled_messages, which already exists for exactly this — a unique message
-- id claimed before sending, so a sweep running twice cannot send twice. A
-- second table would be a second answer to a question already answered.

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios (id) on delete cascade,

  -- What the owner calls it, for their own list. Never sent.
  name text not null,

  -- What it says, with the same placeholders a reminder uses.
  body text not null,

  -- 'email' or 'sms'. Checked in the app against what they have bought.
  channel text not null default 'email',

  -- The job it follows, by name. Null means any appointment.
  after_service text,

  -- How long afterwards. Days, because weeks and months are only ever days.
  after_days integer not null default 42,

  enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campaigns_channel_check check (channel in ('email', 'sms')),
  -- A day is the floor: anything sooner is a reminder, not marketing.
  constraint campaigns_after_days_check check (after_days >= 1 and after_days <= 730)
);

create index if not exists campaigns_studio_idx on campaigns (studio_id);

alter table campaigns enable row level security;

-- The same tenancy rule as everything else a business owns.
create policy "studio members read campaigns" on campaigns
  for select using (is_studio_member(studio_id));

create policy "owners write campaigns" on campaigns
  for all using (is_studio_owner(studio_id)) with check (is_studio_owner(studio_id));

comment on table campaigns is
  'Marketing that follows a job. Needs the business entitlement AND each person consent: see marketingPlan.ts.';

comment on column campaigns.after_service is
  'The job name this follows, matched against bookings.title. Null means any appointment.';
