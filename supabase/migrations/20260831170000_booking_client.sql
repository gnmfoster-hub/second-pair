-- A booking taken by hand is still for somebody.
--
-- Until now a client only existed if a conversation created one, so a salon
-- booking someone in over the phone typed their name into the title and that
-- was the end of it. That person never appeared in Clients, had no history, no
-- notes, no spend, and no alert — and the next time they rang, the assistant
-- had no idea who they were.
--
-- The link is direct rather than through a made-up conversation. Inventing an
-- empty conversation to hang a contact off would put a phantom in the inbox
-- and make every "how many enquiries" figure wrong.

alter table bookings
  add column contact_id uuid references contacts(id) on delete set null;

create index on bookings (contact_id);

comment on column bookings.contact_id is
  'Who a manually-entered booking is for. Bookings from a conversation reach their contact through the enquiry instead; read both.';

-- Contacts were created by the engine, which always had a channel and a
-- conversation. One typed into the diary has neither.
alter table contacts
  alter column channel drop not null;

comment on column contacts.channel is
  'How they first reached us. Null for somebody added by hand in the diary.';
