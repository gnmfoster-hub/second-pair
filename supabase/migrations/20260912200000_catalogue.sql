-- What a business sells, and how long it takes them.
--
-- Today there is price_bands: a size and an hours range, multiplied by a
-- person's hourly rate. That is how a tattooist prices — by the size of the
-- piece and how long it sits — and it is why a salon cannot describe a blow
-- dry in it. A salon sells a named thing for a fixed price in a fixed time.
--
-- price_bands stays exactly as it is. Living Canvas prices by the hour and
-- would break if it moved, and plenty of trades genuinely work that way. A
-- business uses whichever describes what it sells; most will use this one.

create table if not exists services (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,

  name        text not null,

  -- One table rather than two, because a service and a product differ in
  -- exactly one respect — whether they take time — and share everything else:
  -- a name, a price, an order, whether they are still sold. Two tables would
  -- mean two screens, two settings pages and two halves of every report.
  kind        text not null default 'service' check (kind in ('service', 'product')),

  -- How long it takes. Null for a product, which takes none.
  minutes     integer check (minutes is null or minutes > 0),

  -- What it costs. A range is honest for work that varies -- "£120 to £160" --
  -- and the assistant already knows how to quote one.
  price_pence     integer check (price_pence is null or price_pence >= 0),
  price_to_pence  integer check (price_to_pence is null or price_to_pence >= 0),

  -- Some work cannot be booked without being looked at first.
  requires_consultation boolean not null default false,

  -- On the shelf but not on the website: a service somebody can have if they
  -- ask, without the assistant offering it to strangers.
  bookable_online boolean not null default true,

  active      boolean not null default true,
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint services_price_range check (
    price_to_pence is null or price_pence is null or price_to_pence >= price_pence
  ),
  -- A product with a duration is a mistake somebody made in a form, and it
  -- would put a bottle of shampoo in the diary.
  constraint services_product_has_no_time check (kind <> 'product' or minutes is null)
);

create index if not exists services_studio_idx on services (studio_id, active, sort_order);

-- Who does it, and what it costs when they do.
--
-- A senior takes forty minutes over what a junior takes an hour on, and
-- charges more for it. Without this a business can only have one price for a
-- thing, which is true of almost no salon with more than one chair.
--
-- No row means everybody can do it at the business's own price, which is the
-- common case and should not need filling in.
create table if not exists service_people (
  service_id  uuid not null references services(id) on delete cascade,
  artist_id   uuid not null references artists(id) on delete cascade,
  minutes     integer check (minutes is null or minutes > 0),
  price_pence integer check (price_pence is null or price_pence >= 0),
  primary key (service_id, artist_id)
);

-- This client, this service, longer.
--
-- Thick hair that always takes twenty minutes more. Somebody who cannot sit
-- still for a tattoo. Kept on the client because it is true of them wherever
-- they go and whoever does the work, and per service because it is twenty
-- minutes on a colour and nothing at all on a fringe trim.
--
-- Never told to the client. The assistant books the longer slot and offers
-- times that fit it, and says nothing about why -- nobody wants to be the
-- appointment that needs extra time.
create table if not exists client_service_times (
  contact_id   uuid not null references contacts(id) on delete cascade,
  service_id   uuid not null references services(id) on delete cascade,

  -- Minutes on top of the normal length. Negative is allowed and real: some
  -- people are quicker than the book says.
  minutes_delta integer not null,

  -- Off unless somebody says otherwise. A bill that grows on its own is how
  -- trust goes, and whoever adds the time is the one who knows whether it is
  -- more work or just more time.
  chargeable   boolean not null default false,

  -- Why, in the business's own words. Never shown to the client.
  note         text,

  updated_at   timestamptz not null default now(),
  primary key (contact_id, service_id)
);

alter table services enable row level security;
alter table service_people enable row level security;
alter table client_service_times enable row level security;

-- Who may read and change these.
--
-- The same shape as price_bands, which is the table this sits beside: anybody
-- in the business can read what it sells, and only the owner can change it.
-- Prices are the owner's, in every trade.
create policy services_read on services for select
  using (is_studio_member(studio_id));

create policy services_owner on services for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));

-- Reached through the service it belongs to, so tenancy is checked once.
create policy service_people_read on service_people for select
  using (exists (
    select 1 from services s where s.id = service_people.service_id and is_studio_member(s.studio_id)
  ));

-- The owner sets anybody's, and a person sets their own.
--
-- This started owner-only and that was wrong. A stylist already sets her own
-- hourly rate and her own minimum on her own settings page — what she charges
-- for a blow dry is the same kind of fact, and a salon where the owner has to
-- retype five people's prices is a salon that keeps them on a wall instead.
--
-- The row is the person's, so the check is whether the artist row it names is
-- theirs. A person cannot set somebody else's price by pointing the row at
-- them, which is the only way this could be abused.
create policy service_people_owner on service_people for all
  using (exists (
    select 1 from services s where s.id = service_people.service_id and is_studio_owner(s.studio_id)
  ))
  with check (exists (
    select 1 from services s where s.id = service_people.service_id and is_studio_owner(s.studio_id)
  ));

create policy service_people_own on service_people for all
  using (exists (
    select 1 from artists a
    where a.id = service_people.artist_id and a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from artists a
    where a.id = service_people.artist_id and a.user_id = auth.uid()
  ));

-- And these are different: anybody in the business may write one.
--
-- "Thick hair, twenty minutes more" is learned by whoever is stood behind the
-- chair at the time, and it is the only useful moment to record it. Making it
-- the owner's would mean a stylist telling the owner, who would never get
-- round to it, and the knowledge staying in one person's head — which is
-- exactly where it is today.
create policy client_times_read on client_service_times for select
  using (exists (
    select 1 from contacts c
    where c.id = client_service_times.contact_id and is_studio_member(c.studio_id)
  ));

create policy client_times_write on client_service_times for all
  using (exists (
    select 1 from contacts c
    where c.id = client_service_times.contact_id and is_studio_member(c.studio_id)
  ))
  with check (exists (
    select 1 from contacts c
    where c.id = client_service_times.contact_id and is_studio_member(c.studio_id)
  ));

-- Which way this business describes what it sells.
--
-- Two ways now exist and a business only ever wants one: a tattooist prices by
-- the size of the piece and the hours it sits, a salon by the named thing on
-- the price list. Left implicit, both screens would show for everybody and
-- every business would have to work out which half to ignore.
--
-- Existing businesses keep bands, which is what they are set up with. Nothing
-- moves until somebody chooses to.
alter table studios
  add column if not exists pricing_model text not null default 'bands'
    check (pricing_model in ('bands', 'services'));

comment on column studios.pricing_model is
  'bands = size and hours against an hourly rate, as a tattooist prices. services = a named thing at a fixed price, as a salon does.';
