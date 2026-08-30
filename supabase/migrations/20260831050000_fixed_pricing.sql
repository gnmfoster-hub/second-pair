-- Flat-price services.
--
-- Everything so far is hours × an hourly rate, which suits trades that sell
-- time — tattooing, colour work — and cannot express a barber's £18 cut, a
-- dentist's £65 check-up or a fixed-price job at all.
--
-- Per band rather than per business, because the two mix: a salon charges £45
-- for a cut and bills a colour correction by the hour. A band with a price set
-- uses it; a band without falls back to hours × rate, so nothing that already
-- works changes.

alter table price_bands
  add column price_low_pence integer check (price_low_pence >= 0),
  add column price_high_pence integer check (price_high_pence >= 0),
  -- How long to set aside. Without it a fixed-price service has no duration,
  -- because there are no hours to derive one from.
  add column duration_minutes integer check (duration_minutes > 0 and duration_minutes <= 1440);

alter table price_bands
  add constraint price_bands_price_range
  check (
    price_high_pence is null
    or price_low_pence is null
    or price_high_pence >= price_low_pence
  );

-- A fixed price needs a duration; otherwise the diary cannot book it.
alter table price_bands
  add constraint price_bands_fixed_needs_duration
  check (price_low_pence is null or duration_minutes is not null);

comment on column price_bands.price_low_pence is
  'Set for a flat-price service. Null means price by the hour from hours_low/high.';
comment on column price_bands.duration_minutes is
  'How long a flat-price service takes. Required whenever a price is set.';
