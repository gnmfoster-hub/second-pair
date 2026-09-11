-- People asking to be told when a product is ready.
--
-- Second Pair Ltd now has more than one product, and the second — Family APP!
-- — is not on either app store yet. A page that sells something you cannot buy
-- needs somewhere to put the people who wanted it, or the page is just a
-- poster.
--
-- Deliberately its own table rather than contacts: a contact belongs to a
-- business and is somebody's customer, governed by that business's privacy
-- notice. These are our own, and mixing the two would put strangers into a
-- salon's client list.

create table if not exists product_interest (
  id uuid primary key default gen_random_uuid(),
  -- Which product they asked about. Plain text rather than an enum so adding
  -- the third product is a page, not a migration.
  product text not null,
  email text not null,
  name text,
  -- Anything they typed. Optional, and the most useful thing on the row when
  -- somebody explains what they want it for.
  note text,
  -- Where they were when they asked, for telling a launch post from a link
  -- somebody shared.
  source text,
  created_at timestamptz not null default now(),
  -- Set when they have been written to, so nobody is emailed twice.
  told_at timestamptz
);

-- One row per person per product. Asking twice is enthusiasm, not two people,
-- and a launch email arriving in duplicate is the first impression.
create unique index if not exists product_interest_once
  on product_interest (product, lower(email));

create index if not exists product_interest_recent
  on product_interest (product, created_at desc);

/*
 * No policies at all, on purpose.
 *
 * Row-level security with nothing granted means no browser session can read or
 * write this table however it asks — the same arrangement the channel secrets
 * use. Everything that touches it goes through a server action holding the
 * service key, which is the only place the validation lives. A public form
 * with an anon insert policy is an open door to whatever somebody posts.
 */
alter table product_interest enable row level security;

comment on table product_interest is
  'People who asked to be told when one of our products is ready. Ours, not any business''s customers. Service key only.';
