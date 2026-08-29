-- PostgREST builds a batch insert from the union of the keys across all rows,
-- so a row that omits a key is sent an explicit NULL rather than falling back
-- to the column DEFAULT. Seeding size bands where only the large ones carry
-- requires_consultation therefore failed the NOT NULL constraint — and failed
-- for the whole batch, leaving a studio with no bands and an assistant that
-- could not quote.
--
-- BEFORE INSERT triggers run ahead of NOT NULL checks, so filling the defaults
-- here keeps the constraints honest while tolerating the batch shape.

create or replace function price_bands_fill_defaults() returns trigger
language plpgsql as $fn$
begin
  new.requires_consultation := coalesce(new.requires_consultation, false);
  new.sort_order           := coalesce(new.sort_order, 0);
  return new;
end;
$fn$;

create trigger price_bands_defaults
  before insert on price_bands
  for each row execute function price_bands_fill_defaults();
