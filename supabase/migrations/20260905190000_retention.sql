-- How long a business keeps what its customers said.
--
-- Nothing was ever deleted. Conversations, messages and the people who sent
-- them were kept for as long as the account existed, which is not a retention
-- period — it is the absence of one. Article 5(1)(e) asks for personal data to
-- be kept no longer than is necessary, and "forever" cannot be justified for
-- somebody who once asked the price of a haircut and never came back.
--
-- A number of months, chosen by the business, because only they know what they
-- need: a tattooist with a two-year waiting list is not a barber. Null means
-- keep everything, which stays the default — turning this on for existing
-- businesses without asking would delete real history on their behalf.
--
-- Only enquiries that went nowhere. A conversation attached to a booking is
-- part of the record of work actually done, and is left alone.
alter table studios
  add column if not exists keep_months integer
    check (keep_months is null or (keep_months >= 1 and keep_months <= 120));

comment on column studios.keep_months is
  'Delete conversations that never became a booking after this many months. Null keeps everything.';
