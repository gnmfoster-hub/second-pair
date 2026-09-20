-- The business a person trades as, which may not be the one they work at.
--
-- A chair renter is a business inside a business. She rents the chair, her
-- clients found her rather than the salon, and on her own number, her own link
-- and her own Instagram the assistant was introducing itself as the salon. The
-- wrong name on the one channel that is definitely hers.
--
-- Null is the salon's, which is right for anybody on the payroll and is what
-- every person already on the books starts as, so running this changes nothing
-- anywhere until somebody types a name in.
--
-- The app writes it behind a column guard, so it has been safe to deploy ahead
-- of this and starts working the moment this is run. Without the guard a name
-- typed into the box would not merely be lost: PostgREST refuses the whole
-- statement for one unknown column, so the entire save of that person's record
-- would have failed.

alter table artists
  add column if not exists trading_name text;

comment on column artists.trading_name is
  'The business this person trades as, used only on their own channels. Null uses the studio''s own name.';
