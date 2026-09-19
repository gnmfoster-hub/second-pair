-- A website, sold alongside the assistant.
--
-- Giles wants to offer a business its website as an upgrade. The price is not
-- decided, so nothing here contains one: it is a number per business, set when
-- that business agrees to it, which is also what lets an early product charge
-- three customers three different things while it works out what it is worth.
--
-- An add-on rather than a tier, deliberately. A tier means a business has to
-- move off the plan it has already said yes to; an add-on is a second yes on
-- top of a first one, which is an easier thing to sell and a much easier thing
-- to stop selling if it turns out not to work.
--
-- Zero means they do not have one, which is what every business has today, so
-- running this changes nothing anywhere.

alter table studios
  add column if not exists website_pence int not null default 0,
  -- When it started, so the first month can be charged from the right day and
  -- so "how long have they had it" is answerable without reading invoices.
  add column if not exists website_since date;

comment on column studios.website_pence is
  'What this business pays each month for their website. Zero means they have not bought one.';
comment on column studios.website_since is
  'The day the website went live for them. Null until it does.';

-- Copied into the month the same way the plan is, and for the same reason: a
-- price that changes in March must not silently rewrite February's invoice.
alter table usage_months
  add column if not exists website_pence int not null default 0;

comment on column usage_months.website_pence is
  'What the website cost them in this month, as priced at the time.';
