-- How much of a business's email the assistant may answer by itself.
--
-- For the business with one address for everything. Forwarding a whole mailbox
-- to an assistant that answers anything a person wrote means it replies to
-- their accountant, their supplier and their sister, in the business's name,
-- about cleaning. That costs almost nothing and is mortifying, and it is the
-- sort of thing that ends a customer relationship.
--
-- Default is "all", because that is what a dedicated enquiry address wants and
-- what every business set up so far is doing. Nobody is changed by this
-- migration.

alter table studios
  add column if not exists inbound_mode text not null default 'all'
    check (inbound_mode in ('all', 'listed', 'none')),
  -- Their public addresses, used only when the mode is 'listed'. Empty with
  -- that mode set means nothing is answered, which is deliberate: it reads as
  -- "not finished setting up" rather than as "answer everything".
  add column if not exists inbound_addresses text[] not null default '{}';

comment on column studios.inbound_mode is
  'all = answer anything that reads like a customer; listed = only mail sent to inbound_addresses; none = file everything for a person to answer.';

comment on column studios.inbound_addresses is
  'The business''s own public addresses — the ones on the van and the website. Only consulted when inbound_mode is ''listed''.';
