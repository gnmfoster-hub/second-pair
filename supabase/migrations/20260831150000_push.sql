-- Telling the owner when the assistant needs them.
--
-- The whole pitch is that enquiries get handled while you work. The corollary
-- is that when one genuinely cannot be — a complaint, something medical,
-- somebody asking for a person — you have to find out without checking the app.
--
-- Web push rather than email or SMS, because it needs no third-party account,
-- no per-message cost and no phone number, and this app is already installable
-- to a home screen. Email and SMS can be added alongside later; the sending
-- code is deliberately kept behind one function so that is a small change.

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,
  -- Whose device this is. A salon owner and their manager get their own.
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- What the browser gave us. The endpoint is the address; the two keys
  -- encrypt the payload so the push service cannot read it.
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,

  -- For telling "my phone" from "the salon iPad" in the settings list.
  label        text,

  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- One row per device. Re-subscribing on the same browser updates rather than
-- piling up duplicates, which would send the same alert four times.
create unique index push_subscriptions_endpoint_key on push_subscriptions (endpoint);
create index on push_subscriptions (studio_id);

alter table push_subscriptions enable row level security;

-- Members manage their own studio's subscriptions. Deliberately not
-- per-user-only: an owner should be able to see and remove a device that has
-- been lost, or one belonging to somebody who has left.
create policy "studio members manage push subscriptions" on push_subscriptions
  for all
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

comment on table push_subscriptions is
  'Browser push endpoints, one per device. The private VAPID key lives in the environment, never here.';
