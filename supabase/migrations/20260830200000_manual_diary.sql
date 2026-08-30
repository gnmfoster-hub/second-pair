-- The owner has to be able to work the diary, or they need a second system and
-- Handled becomes the thing getting in the way.
--
-- Three kinds of entry, all in `bookings` so the no-overlap guarantee covers
-- every one of them, and so availability needs no special cases: a blocked
-- lunch hour removes itself from what the assistant offers, for free.
--
--   assistant  booked through a conversation. Has an enquiry.
--   manual     put in by the owner — a walk-in, a phone booking. May have no enquiry.
--   block      not a client at all — holiday, lunch, admin. Never has an enquiry.

create type booking_source as enum ('assistant', 'manual', 'block');

alter table bookings
  add column source booking_source not null default 'assistant',
  -- What the owner typed. For a block that is the only description there is.
  add column title text,
  add column notes text;

-- A block or a phone booking has no enquiry behind it.
alter table bookings alter column enquiry_id drop not null;

-- An assistant booking must still be attached to the enquiry that made it,
-- otherwise the conversation and the appointment come apart.
alter table bookings
  add constraint bookings_assistant_has_enquiry
  check (source <> 'assistant' or enquiry_id is not null);

-- A block is not a client appointment, so it never carries a deposit.
alter table bookings
  add constraint bookings_block_has_no_deposit
  check (source <> 'block' or deposit_amount_pence = 0);

comment on column bookings.source is
  'assistant = booked in a conversation, manual = entered by the owner, block = time the artist is unavailable.';
