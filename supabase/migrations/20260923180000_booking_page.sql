-- A page a customer can open about their own appointment.
--
-- Not run yet. Nothing sends the link until it has, and the page answers
-- "no such booking" to anything it cannot find, so a deploy landing first
-- changes nothing anybody sees.
--
-- The point of it, from Giles: the better confirmations send a short text with
-- a link to a proper page rather than cramming everything into 160 characters.
-- A text can carry a sentence; what was booked, when, with whom, what it comes
-- to, the business's cancellation policy and a way to add it to a calendar
-- need somewhere to live.
--
-- An unguessable token rather than the booking's id, and the distinction
-- matters. Ids appear in our own URLs, in logs and in support conversations;
-- this one is a key sent to a customer's phone that opens their name, their
-- appointment and what they are paying. They are different secrets with
-- different lifetimes and they should not be the same string.
--
-- The same generator the calendar feeds and the marketing preference links
-- already use, so there is one answer to "how long and how random" rather than
-- three.

alter table bookings
  add column if not exists public_token text;

update bookings set public_token = new_calendar_token() where public_token is null;

alter table bookings alter column public_token set default new_calendar_token();
alter table bookings alter column public_token set not null;

create unique index if not exists bookings_public_token_key on bookings (public_token);

comment on column bookings.public_token is
  'Unguessable key for the customer-facing page at /b/<token>. Not the id: this one is sent out.';
