-- Trying your own assistant out, without it counting.
--
-- The owner needs to hear what their assistant actually says before a customer
-- does — wrong opening hours, a missing FAQ or a rate left at the default all
-- sound fine in a settings form and obvious in a conversation.
--
-- Those rehearsals must not reach the inbox, the client list, or the weekly
-- figures. "Your assistant answered 14 enquiries this week" is worthless if
-- nine of them were the owner testing it.

alter table conversations
  add column is_test boolean not null default false;

-- The inbox and the report both filter on this, so it wants an index that
-- covers the common case of "everything real, newest first".
create index conversations_real_idx
  on conversations (studio_id, last_message_at desc)
  where is_test = false;

comment on column conversations.is_test is
  'A rehearsal by the owner. Excluded from the inbox, the client list and every figure.';
