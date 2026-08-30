-- Deposits are a tattoo and salon habit, not a universal one.
--
-- A plumber, a dentist and a driving instructor all want the assistant booking
-- appointments and none of them want it asking for money up front. Assuming a
-- deposit made the whole product unusable to them, so it becomes a mode:
--
--   required  the slot is held until the deposit is paid. Today's behaviour.
--   optional  offered, but the booking stands either way.
--   none      never mentioned. The assistant books and confirms, that is all.
--
-- Deliberately explicit rather than inferred from "deposit is zero", so an
-- owner who wants deposits but has not set an amount yet gets told, instead of
-- silently having the feature switched off.

create type deposit_mode as enum ('required', 'optional', 'none');

alter table studios
  add column deposit_mode deposit_mode not null default 'required';

comment on column studios.deposit_mode is
  'Whether the assistant asks for a deposit before confirming: required, optional, or never.';
