-- VAT.
--
-- Any business over the threshold has to quote with VAT, and until now the
-- assistant had no concept of it — so for a registered business every price it
-- gave was arguably wrong.
--
-- Two questions, because trades answer them differently: a salon quoting a
-- consumer says "£45" meaning inclusive; an electrician quoting a landlord
-- often says "£300 plus VAT". Both must be sayable.
--
-- Deliberately narrow: this is about quoting the right number to a customer.
-- Working out what is owed to HMRC is their accountant's job, not ours.

alter table studios
  add column vat_registered boolean not null default false,
  add column vat_rate_percent numeric(4,1) not null default 20.0
    check (vat_rate_percent >= 0 and vat_rate_percent <= 100),
  -- Whether the prices entered in settings already contain VAT.
  add column prices_include_vat boolean not null default true,
  add column vat_number text;

comment on column studios.prices_include_vat is
  'True when the prices in settings already contain VAT. False when they are ex-VAT and it must be added.';
