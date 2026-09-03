-- "I know about this one."
--
-- The attention panel infers setup problems from the data, which is right, but
-- it gave you nothing to do about a problem you already knew about. A customer
-- part-way through setting up sat in the list looking like a fault every time
-- the page was opened, and the only ways out were to finish their setup for
-- them or delete them.
--
-- A date rather than a flag, so this is snoozing and not dismissing. Something
-- genuinely broken comes back next week and asks again; a permanent dismiss
-- would let a business that cannot answer anybody disappear off the one screen
-- that would have told you.
alter table studios
  add column if not exists attention_snoozed_until date;

comment on column studios.attention_snoozed_until is
  'Inferred problems stay out of the attention panel until this date. Requests always show.';
