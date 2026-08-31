-- Email as a way of reaching somebody.
--
-- It was never in the list, which meant a booking confirmation, a deposit
-- receipt and a staff invite all had nowhere to go. Those are the things email
-- is genuinely good at: something to keep, something with a calendar file
-- attached, something you go back and look for a week later.
--
-- It is deliberately not the reminder channel. People do not read email, and
-- "you are in at four tomorrow" has to be read. That is SMS's job.
--
-- Adding the value on its own, in its own migration, because Postgres will not
-- let a new enum value be used in the transaction that created it.

alter type channel add value if not exists 'email';
