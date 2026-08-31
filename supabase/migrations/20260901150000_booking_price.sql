-- What a booking is worth.
--
-- The week's takings were read off the enquiry's quote, which works only for
-- work the assistant booked. Anything typed straight into the diary — the
-- regular who rings up, the walk-in, everything a busy shop actually does —
-- had no price anywhere, so a salon that types its own bookings in saw a week
-- worth £0 and reasonably concluded the figure was broken.
--
-- Nullable, and separate from the deposit: the deposit is what has been taken,
-- this is what the job comes to.

alter table bookings
  add column price_pence integer check (price_pence is null or price_pence >= 0);

comment on column bookings.price_pence is
  'What this booking is worth in total. Null falls back to the enquiry quote, for work the assistant booked.';

-- Anything already quoted keeps its figure, so the number does not move.
update bookings b
   set price_pence = e.quote_low_pence
  from enquiries e
 where e.id = b.enquiry_id
   and b.price_pence is null
   and e.quote_low_pence is not null;
