-- Which service an enquiry is for.
--
-- The catalogue exists, people price against it, and clients have their own
-- timings recorded against it — and none of it reaches the assistant, because
-- an enquiry has nowhere to record which service it is about.
--
-- It cannot reuse size_band_id. That column carries a foreign key to
-- price_bands, so a service id in it is rejected by the database rather than
-- quietly stored: the two models are different tables and have to stay so.
--
-- Both columns exist from here on and a business uses whichever it prices by.
-- Nothing moves: every existing enquiry keeps its band, and a business on
-- bands never writes this one.
alter table enquiries
  add column if not exists service_id uuid references services(id) on delete set null;

comment on column enquiries.service_id is
  'What was asked for, when the business prices by a named service. Bands use size_band_id instead; an enquiry has one or the other, never both.';

create index if not exists enquiries_service_idx on enquiries (service_id);

-- What a booking actually took, and what was said about it afterwards.
--
-- attended has been written since the no-show control landed, and it only
-- answers whether they came. The other half of closing a booking off is how
-- long it really took — which is the number that makes every future estimate
-- better, and the one thing no diary ever records.
--
-- Null means nobody said, which stays the common case: somebody closing off a
-- booking at half past five is answering "did they come", and being made to
-- answer "how long exactly" as well is how they stop answering either.
alter table bookings
  add column if not exists actual_minutes integer
    check (actual_minutes is null or actual_minutes > 0),
  add column if not exists outcome_note text;

comment on column bookings.actual_minutes is
  'How long it really took. Null until somebody says, which is most of them.';
comment on column bookings.outcome_note is
  'What happened, in their own words. Never shown to the client.';
