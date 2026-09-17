-- Asking for a review, the morning after.
--
-- A whole category of competitor — Podium, Birdeye, Weave — exists on this one
-- feature, and it is the cheapest marketing a small business has: the trades we
-- sell to live or die on a Google rating that a customer only leaves if
-- somebody asks them to.
--
-- Two columns, both off until the owner fills them in. Nothing is ever sent
-- without a link, because a request with no link is a message with a hole in
-- it, and nothing is sent to somebody who has texted STOP.

alter table studios
  -- Where to send them. Usually a Google review link, but anything works.
  add column if not exists review_url text,
  add column if not exists review_ask boolean not null default false;

comment on column studios.review_url is
  'Where a review request sends the customer. Google Business Profile → Ask for reviews.';
comment on column studios.review_ask is
  'Whether to ask. Only acts when review_url is set as well.';
