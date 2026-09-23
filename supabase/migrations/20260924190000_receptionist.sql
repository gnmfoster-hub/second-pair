-- Two things, sold apart.
--
-- Not run yet. Nothing changes until it is: both columns are off for
-- everybody and the app reads an absent column as off.
--
-- Giles: "the calls option in settings — is that for the answering message
-- and text back, or the receptionist. They need to be two separate things,
-- both scoped with pricing, so I can sell them as an add on."
--
-- They were one thing wearing two names. What `voice` in channels_allowed
-- buys today is answering: a call comes in, the owner's mobile rings for
-- fifteen seconds, and if nobody picks up the caller is texted back — or
-- leaves a message that is written down and answered by text. Nobody ever
-- talks to a machine. That is a complete product and it is not a receptionist.
--
-- The Receptionist is the other one: it picks up and holds the conversation.
-- Its only trace so far is artists.voice_on, a switch in the admin team panel
-- that nothing reads, because the talking agent is not built. A switch that
-- cannot be sold and does nothing is not a product either.
--
-- So: one column for whether a business may have Receptionists at all, which
-- is Giles's to set when he sells one, and one for whether the business's own
-- line has one, which is the owner's to switch. Per person stays where it is
-- on artists.voice_on. Every switched-on instance is a thing to charge for,
-- which is why they are counted separately rather than inferred from calls —
-- a line can have a Receptionist and take no calls in a quiet month, and it
-- still costs.
--
-- Why allowed and on are two columns rather than one. They answer different
-- questions and different people answer them. Collapsing them would mean
-- either a business can give itself a Receptionist nobody sold it, or Giles
-- has to be rung to switch off something that is costing them — and the second
-- is how an add-on gets a bad name.

alter table studios
  add column if not exists receptionist_allowed boolean not null default false;

alter table studios
  add column if not exists receptionist_on boolean not null default false;

comment on column studios.receptionist_allowed is
  'This business has been sold the Receptionist and may switch instances on. Set by us when it is sold, never by the business. Without it, receptionist_on and artists.voice_on do nothing.';

comment on column studios.receptionist_on is
  'The business own line has a Receptionist. One chargeable instance. The owner switches it, and only where receptionist_allowed.';
