-- Handled is aimed at tattoo studios first, but the same engine fits barbers,
-- salons, piercers and cosmetic clinics. Two things were tattoo-shaped in a way
-- that would have cost a data migration later:
--
--   enquiry_intent  ('new_tattoo', 'cover_up', 'touch_up', ...)
--   tattoo_style    ('traditional', 'fine_line', 'blackwork', ...)
--
-- Postgres enums are the worst place for a list that varies by trade, so both
-- become per-studio option lists. Everything else in the schema — channels,
-- conversations, bookings, deposits — was already trade-neutral.

-- ---------------------------------------------------------------- studio

alter table studios
  add column vertical text not null default 'tattoo',
  -- What this trade calls things. Read into the assistant's prompt so one
  -- engine can say "tattooed", "cut" or "treated" without a code change.
  add column vocabulary jsonb not null default '{
    "practitioner": "artist",
    "practitioners": "artists",
    "service": "tattoo",
    "service_verb": "tattooed",
    "size_unit": "size",
    "customer": "client"
  }'::jsonb;

comment on column studios.vertical is
  'Which template pack seeded this studio: tattoo, barber, salon, piercing, clinic.';

-- ---------------------------------------------------------------- options

-- The styles, intents and other pick-lists a studio qualifies against. What was
-- an enum is now rows, so a barber can offer "skin fade" where a tattooist
-- offers "blackwork".
create type option_kind as enum ('style', 'intent');

create table service_options (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  kind       option_kind not null,
  value      text not null,   -- stable key, e.g. fine_line
  label      text not null,   -- what the client sees, e.g. Fine line
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (studio_id, kind, value)
);
create index on service_options (studio_id, kind, sort_order);

alter table service_options enable row level security;
create policy service_options_rw on service_options for all
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

-- Same PostgREST batch-insert trap as price_bands: a row omitting a key another
-- row in the batch has is sent an explicit NULL, not the default.
create or replace function service_options_fill_defaults() returns trigger
language plpgsql as $fn$
begin
  new.sort_order := coalesce(new.sort_order, 0);
  return new;
end;
$fn$;

create trigger service_options_defaults
  before insert on service_options
  for each row execute function service_options_fill_defaults();

-- ---------------------------------------------------------------- migrate off the enums

-- artists.styles[] and enquiries.style become plain text keys into
-- service_options. Existing values carry over unchanged.
alter table artists
  alter column styles drop default,
  alter column styles type text[] using styles::text[],
  alter column styles set default '{}';

alter table enquiries
  alter column style type text using style::text,
  alter column intent type text using intent::text;

drop type tattoo_style;
drop type enquiry_intent;

-- ---------------------------------------------------------------- seed the tattoo pack

-- Every studio that exists today is a tattoo studio.
insert into service_options (studio_id, kind, value, label, sort_order)
select s.id, 'style', v.value, v.label, v.sort_order
from studios s
cross join (values
  ('traditional',    'Traditional',    0),
  ('fine_line',      'Fine line',      1),
  ('realism',        'Realism',        2),
  ('blackwork',      'Blackwork',      3),
  ('script',         'Script',         4),
  ('colour',         'Colour',         5),
  ('black_and_grey', 'Black and grey', 6),
  ('other',          'Other',          7)
) as v(value, label, sort_order)
on conflict do nothing;

insert into service_options (studio_id, kind, value, label, sort_order)
select s.id, 'intent', v.value, v.label, v.sort_order
from studios s
cross join (values
  ('new_tattoo',   'New tattoo',        0),
  ('cover_up',     'Cover-up',          1),
  ('touch_up',     'Touch-up',          2),
  ('consultation', 'Consultation only', 3),
  ('question',     'General question',  4)
) as v(value, label, sort_order)
on conflict do nothing;
