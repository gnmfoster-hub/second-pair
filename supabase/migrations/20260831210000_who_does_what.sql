-- Who does what, inside one business.
--
-- Services were the business's, shared by everyone in it. That is right for a
-- one-person business and for most small ones, and wrong the moment a shop has
-- people who do different things:
--
--   A tattoo studio with a piercer. A hair salon with a nail technician. A
--   garage where one person does MOTs and another does bodywork.
--
-- The assistant would offer a balayage with the nail tech, quote it at her
-- rate, and put it in her diary. Nobody finds out until somebody turns up.
--
-- Modelled as an exception rather than a rule. A service with no rows here is
-- done by everybody, which is what almost every business wants and what all of
-- them start as — so a shop that does not care never touches this, and one
-- that does only names the exceptions.

create table service_providers (
  band_id   uuid not null references price_bands(id) on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  primary key (band_id, artist_id)
);

create index on service_providers (artist_id);

alter table service_providers enable row level security;

-- Reached through the band, which carries the studio. A booking's ownership
-- runs through the artist for the same reason: use whichever route the row
-- actually has.
create policy "studio members manage who does what" on service_providers
  for all
  using (
    exists (
      select 1 from price_bands b
      where b.id = service_providers.band_id and is_studio_member(b.studio_id)
    )
  )
  with check (
    exists (
      select 1 from price_bands b
      where b.id = service_providers.band_id and is_studio_member(b.studio_id)
    )
  );

comment on table service_providers is
  'Which people offer which services. No rows for a service means everybody does it.';
