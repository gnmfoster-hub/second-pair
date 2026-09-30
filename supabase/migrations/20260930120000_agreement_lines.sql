-- The priced schedule on an agreement.
--
-- One short statement, for the reason the last one had to be split into five:
-- pasting into the Supabase SQL editor truncates at about a thousand characters.
-- This is under two hundred. Plain ASCII, and safe to run twice.
--
-- Giles, 30 September: "the agreement isn't very in depth and should really have
-- separate lines to add services and costs etc."
--
-- A set-up fee and one recurring figure is not a schedule. A real one here is a
-- website built once, an assistant every month, the Receptionist every month and
-- a bundle of texts on top: four lines, three recurring, two different kinds of
-- thing. Rolled into two numbers the client cannot see what they are paying for,
-- and neither can we a year later when they ask why it is forty-three pounds.
--
-- jsonb rather than a second table, and this is the one decision worth arguing
-- with. A table of lines would be the normal answer and is the wrong one here,
-- because these are not rows anybody queries: they are part of a document that
-- is frozen at the moment it is sent. The wording in terms_text already contains
-- them in prose. Their job in a column is to be read back into the form when
-- somebody corrects an agreement, and to be totalled - both of which want the
-- whole set at once, which is exactly what jsonb gives.
--
-- The totals stay in setup_fee_pence and recurring_pence, which the back office
-- sorts and adds up. They are the sums of these lines, written by whatever
-- creates the agreement rather than typed twice.
--
-- Nullable and defaulted to an empty array, so every agreement written before
-- today goes on rendering exactly as it did. A signature is against a wording,
-- and changing how an old one renders is the one thing this must never do.

alter table agreements
  add column if not exists lines jsonb not null default '[]'::jsonb;

comment on column agreements.lines is
  'The priced schedule as sent: [{what, pence, when}] where when is once, monthly, quarterly or yearly. Part of a frozen document rather than queryable rows, which is why it is jsonb. setup_fee_pence and recurring_pence are the sums of it.';
