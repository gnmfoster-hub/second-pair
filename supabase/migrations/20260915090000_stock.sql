-- What a product costs the shop, and how many are left.
--
-- The shelf can be described and sold from, and nothing knows anything about
-- it beyond a name and a price. Two questions a shop asks about its own stock
-- that it currently cannot: what did we make on that, and have we got any.
--
-- Both are optional, and deliberately. Most of these businesses sell four
-- things off a shelf and count them by looking; being made to keep a stock
-- figure accurate is how a feature becomes a chore and then a lie. Null means
-- "not counting", which stays the default and is a real answer rather than a
-- gap.

alter table services
  -- What it cost to buy in, so a month can be asked what it made rather than
  -- only what it took. Null where nobody has said, which is not zero — zero
  -- would quietly report every bottle as pure profit.
  add column if not exists cost_pence integer check (cost_pence is null or cost_pence >= 0),

  -- How many are on the shelf. Null is not counting; zero is counting and
  -- having none, and those are different sentences on a screen.
  add column if not exists stock integer check (stock is null or stock >= 0);

comment on column services.cost_pence is
  'What it cost to buy in. Null means nobody has said — not zero, which would report every sale as pure profit.';

comment on column services.stock is
  'How many are left. Null means this is not counted at all; zero means counted and none left.';
