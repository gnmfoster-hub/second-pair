-- Handled initial schema
-- Money is stored in integer pence everywhere. Never floats.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

create type channel        as enum ('web', 'whatsapp', 'instagram', 'sms', 'voice');
create type message_role   as enum ('client', 'assistant', 'owner', 'system');
create type conv_status    as enum ('new', 'qualified', 'deposit_paid', 'booked', 'needs_human', 'lost');
create type enquiry_intent as enum ('new_tattoo', 'cover_up', 'touch_up', 'consultation', 'question');
create type tattoo_style   as enum ('traditional', 'fine_line', 'realism', 'blackwork', 'script', 'colour', 'black_and_grey', 'other');
create type booking_type   as enum ('consultation', 'session');
create type deposit_status as enum ('unpaid', 'link_sent', 'paid', 'refunded', 'forfeited');
create type member_role    as enum ('owner', 'staff');

-- ---------------------------------------------------------------- studios

create table studios (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  tone                text not null default 'Friendly and direct. No corporate language.',
  hours               jsonb not null default '[]'::jsonb,   -- [{day:0-6, open:"10:00", close:"18:00", closed:false}]
  deposit_rule        jsonb not null default '{"type":"fixed","amount_pence":5000}'::jsonb,
  cancellation_policy text not null default '',
  privacy_notice_url  text,
  stripe_account_id   text,
  timezone            text not null default 'Europe/London',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Links auth users to the studios they can see. Not in the original spec, but
-- RLS has nothing to key off without it.
create table studio_members (
  studio_id  uuid not null references studios(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       member_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);
create index on studio_members (user_id);

-- ---------------------------------------------------------------- studio config

create table artists (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references studios(id) on delete cascade,
  name              text not null,
  styles            tattoo_style[] not null default '{}',
  hourly_rate_pence integer not null check (hourly_rate_pence >= 0),
  min_charge_pence  integer not null check (min_charge_pence  >= 0),
  day_rate_pence    integer check (day_rate_pence >= 0),
  calendar_id       text,                    -- Google Calendar id
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on artists (studio_id);

-- Size bands drive the quote. hours_low/high multiply the artist hourly rate.
create table price_bands (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  size_label  text not null,                 -- coin, palm, hand, forearm, half sleeve...
  hours_low   numeric(4,1) not null check (hours_low  > 0),
  hours_high  numeric(4,1) not null check (hours_high > 0),
  sort_order  integer not null default 0,
  -- Bands at or above this size need a consultation before a session is booked.
  requires_consultation boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint price_bands_range check (hours_high >= hours_low),
  unique (studio_id, size_label)
);
create index on price_bands (studio_id, sort_order);

create table faqs (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  question   text not null,
  answer     text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index on faqs (studio_id, sort_order);

-- ---------------------------------------------------------------- people and conversations

create table contacts (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references studios(id) on delete cascade,
  name              text,
  phone             text,
  email             text,
  instagram_handle  text,
  channel           channel not null,
  marketing_consent boolean not null default false,   -- default off, kept apart from the enquiry
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on contacts (studio_id);
create unique index contacts_studio_phone_key on contacts (studio_id, phone) where phone is not null;
create unique index contacts_studio_ig_key    on contacts (studio_id, instagram_handle) where instagram_handle is not null;

create table conversations (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references studios(id) on delete cascade,
  contact_id        uuid not null references contacts(id) on delete cascade,
  channel           channel not null,
  status            conv_status not null default 'new',
  ai_paused         boolean not null default false,      -- set by owner takeover
  -- external thread key: Twilio conversation sid, IG thread id, widget session id
  external_ref      text,
  first_response_ms integer,                              -- metric: median first response
  last_message_at   timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index on conversations (studio_id, status, last_message_at desc);
create unique index conversations_channel_ref_key on conversations (channel, external_ref) where external_ref is not null;

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            message_role not null,
  content         text not null default '',
  media_urls      text[] not null default '{}',
  -- raw tool_use / tool_result blocks so the engine can replay Anthropic turns
  tool_calls      jsonb,
  created_at      timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

-- ---------------------------------------------------------------- enquiry and booking

create table enquiries (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade unique,
  intent           enquiry_intent,
  description      text,
  placement        text,
  size_band_id     uuid references price_bands(id) on delete set null,
  style            tattoo_style,
  artist_id        uuid references artists(id) on delete set null,
  cover_up         boolean,
  age_confirmed    boolean,
  preferred_times  text,
  reference_urls   text[] not null default '{}',
  quote_low_pence  integer check (quote_low_pence  >= 0),
  quote_high_pence integer check (quote_high_pence >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint enquiries_quote_range check (
    quote_high_pence is null or quote_low_pence is null or quote_high_pence >= quote_low_pence
  )
);

create table bookings (
  id                     uuid primary key default gen_random_uuid(),
  enquiry_id             uuid not null references enquiries(id) on delete cascade,
  artist_id              uuid not null references artists(id) on delete restrict,
  type                   booking_type not null,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  deposit_amount_pence   integer not null default 0 check (deposit_amount_pence >= 0),
  deposit_status         deposit_status not null default 'unpaid',
  stripe_payment_link_id text,
  stripe_session_id      text,
  calendar_event_id      text,
  cancelled_at           timestamptz,
  attended               boolean,             -- metric: no-show rate
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint bookings_time_range check (ends_at > starts_at)
);
create index on bookings (artist_id, starts_at);
create index on bookings (enquiry_id);

-- ---------------------------------------------------------------- updated_at

create or replace function set_updated_at() returns trigger
language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array['studios','artists','contacts','enquiries','bookings']
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end;
$do$;

-- ---------------------------------------------------------------- row level security

-- Membership check. security definer so the policy can read studio_members
-- without recursing into studio_members' own policy.
create or replace function is_studio_member(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable as $fn$
  select exists (
    select 1 from studio_members m
    where m.studio_id = target and m.user_id = auth.uid()
  );
$fn$;

alter table studios        enable row level security;
alter table studio_members enable row level security;
alter table artists        enable row level security;
alter table price_bands    enable row level security;
alter table faqs           enable row level security;
alter table contacts       enable row level security;
alter table conversations  enable row level security;
alter table messages       enable row level security;
alter table enquiries      enable row level security;
alter table bookings       enable row level security;

create policy studio_rw on studios
  for all using (is_studio_member(id)) with check (is_studio_member(id));

create policy member_read on studio_members
  for select using (user_id = auth.uid() or is_studio_member(studio_id));

-- Tables that carry studio_id directly
do $do$
declare t text;
begin
  foreach t in array array['artists','price_bands','faqs','contacts','conversations']
  loop
    execute format(
      'create policy %I_rw on %I for all
         using (is_studio_member(studio_id))
         with check (is_studio_member(studio_id))', t, t);
  end loop;
end;
$do$;

create policy messages_rw on messages for all
  using (exists (select 1 from conversations c
                 where c.id = conversation_id and is_studio_member(c.studio_id)))
  with check (exists (select 1 from conversations c
                 where c.id = conversation_id and is_studio_member(c.studio_id)));

create policy enquiries_rw on enquiries for all
  using (exists (select 1 from conversations c
                 where c.id = conversation_id and is_studio_member(c.studio_id)))
  with check (exists (select 1 from conversations c
                 where c.id = conversation_id and is_studio_member(c.studio_id)));

create policy bookings_rw on bookings for all
  using (exists (select 1 from enquiries e join conversations c on c.id = e.conversation_id
                 where e.id = enquiry_id and is_studio_member(c.studio_id)))
  with check (exists (select 1 from enquiries e join conversations c on c.id = e.conversation_id
                 where e.id = enquiry_id and is_studio_member(c.studio_id)));

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public)
values ('references', 'references', false)
on conflict (id) do nothing;

-- Reference images are filed under <studio_id>/<conversation_id>/<filename>
create policy "studio members read references" on storage.objects
  for select using (
    bucket_id = 'references'
    and is_studio_member(((storage.foldername(name))[1])::uuid)
  );
