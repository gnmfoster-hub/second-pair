-- Selling something, and who is allowed to write it down.
--
-- A business can already set up what it sells: services and products live in
-- the same table and the pricing screen makes both. Nothing anywhere could
-- sell one. A salon could type in every bottle on its shelf and there was no
-- screen in the product that would take money for a bottle — which is the same
-- shape of gap as the twenty other places where a thing existed and nothing
-- exposed it.
--
-- The payment already has a kind of 'product' and a free-text description, so
-- one sale of one thing was nearly recordable. Two things were missing: what
-- was in the sale, and permission for the person who actually made it.

-- ─────────────────────────────────────────────────────── what was in it

/*
 * The lines of a sale.
 *
 * A sale is two shampoos and a conditioner far more often than it is one
 * thing, and a total with "products" written next to it cannot answer the
 * question a shop actually asks at the end of a month: what sells.
 *
 * The name and the price are copied in rather than only pointed at. A product
 * that is renamed, repriced or taken off the shelf must not quietly rewrite
 * what somebody was charged in March — an old receipt has to still say what
 * the customer was told at the till. The link to the service is kept as well,
 * for reporting, and is allowed to go null when the product is deleted: the
 * history survives either way.
 */
create table if not exists payment_items (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references payments(id) on delete cascade,

  -- What it was, if it is still on the price list. Null for something typed in
  -- on the spot, and for anything since deleted.
  service_id  uuid references services(id) on delete set null,

  -- What it was called at the time, and what it cost at the time.
  name        text not null,
  quantity    integer not null default 1 check (quantity > 0),
  unit_pence  integer not null check (unit_pence >= 0),

  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists payment_items_payment_idx on payment_items (payment_id);
create index if not exists payment_items_service_idx on payment_items (service_id);

alter table payment_items enable row level security;

-- Reached through the payment they belong to, so tenancy is checked once and
-- in one place.
--
-- No "drop policy if exists" in front of these, unlike the older migrations.
-- The table above is created here, so its policies cannot already exist, and
-- the drop lines were three chances for a statement to be mistyped or lost on
-- the way into a SQL editor in exchange for guarding against nothing. Which is
-- not hypothetical: this file failed to run the first time because one of them
-- arrived without its semicolon, and the error pointed at the create after it.
create policy payment_items_read on payment_items for select
  using (exists (
    select 1 from payments p
    where p.id = payment_items.payment_id and is_studio_member(p.studio_id)
  ));

create policy payment_items_write on payment_items for all
  using (exists (
    select 1 from payments p
    where p.id = payment_items.payment_id and is_studio_member(p.studio_id)
  ))
  with check (exists (
    select 1 from payments p
    where p.id = payment_items.payment_id and is_studio_member(p.studio_id)
  ));

-- ────────────────────────────────────────── who may write a sale down

/*
 * The person who made the sale records the sale.
 *
 * payments was owner-only to write, on the reasoning that nobody should be
 * hand-editing money. That reasoning is still right for editing and wrong for
 * recording: a bottle sold at the desk is sold by whoever is stood at the desk,
 * and a shop where every sale has to go through the owner is a shop that keeps
 * a paper pad instead — and then the tax export is missing the counter takings
 * it exists to total up.
 *
 * So: insert, and only insert. No update and no delete for staff, which is what
 * keeps the original reasoning intact — a mistake is corrected by a refund,
 * which is its own row and leaves both halves visible. The owner's policy is
 * unchanged and still covers everything.
 *
 * The row has to be their own. Without the artists check a member of staff
 * could record takings against somebody else, which on the per-person model is
 * putting money in another person's name.
 */
create policy payments_staff_record on payments for insert
  with check (
    is_studio_member(studio_id)
    and (
      artist_id is null
      or exists (
        select 1 from artists a
        where a.id = payments.artist_id and a.user_id = auth.uid()
      )
    )
  );

comment on column payments.method is
  'How it was taken: cash, card machine, or a link. Free text, because it is for whoever reconciles against a till at the end of the day rather than for the code.';
