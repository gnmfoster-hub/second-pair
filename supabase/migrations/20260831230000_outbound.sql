-- Messages that go out, and whether they arrived.
--
-- A reply used to write a row and stop. On the website widget that is enough —
-- the customer sees it when they reopen the chat. On WhatsApp, Instagram or
-- SMS it is not: the reply has to be handed to the platform, and the platform
-- can refuse it.
--
-- Without recording that, an owner types a reply, sees it in the thread, and
-- has no idea it never left the building. Which is worse than not replying,
-- because they think they have.
--
-- Also adds outbound conversations: the business starting one rather than
-- answering. A salon with a cancelled slot wants to offer it to somebody, and
-- that is the same machinery pointed the other way.

create type delivery_status as enum (
  'not_needed',   -- the widget: the customer reads it in the chat itself
  'queued',
  'sent',
  'delivered',
  'failed',
  -- WhatsApp and Messenger only allow free-form replies within 24 hours of the
  -- customer's last message. Outside it, a pre-approved template is required.
  -- This is a platform rule, not ours, and it has to be visible.
  'outside_window'
);

alter table messages
  add column delivery delivery_status not null default 'not_needed',
  add column delivered_at timestamptz,
  add column delivery_error text,
  -- The platform's own id, for chasing a delivery report later.
  add column external_id text;

comment on column messages.delivery is
  'Whether an outgoing message reached the customer. Incoming messages and widget replies are not_needed.';

-- Whether the business started this conversation, rather than answering one.
alter table conversations
  add column outbound boolean not null default false;

comment on column conversations.outbound is
  'True when the business reached out first — an offer of a cancelled slot, a follow-up.';

-- ------------------------------------------------------------- permissions
--
-- Messaging a customer is the one thing in here that reaches the outside
-- world in the business's name. Reading a thread is one thing; sending in the
-- salon's voice is another, and an owner should be able to decide who does.

alter table studio_members
  add column can_message boolean not null default true;

comment on column studio_members.can_message is
  'Whether this person may send messages to customers. Owners always can; staff can unless the owner says otherwise.';
