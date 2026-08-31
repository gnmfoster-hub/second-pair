-- A rehearsal must not leave a client behind either.
--
-- Marking only the conversation was half a fix: every conversation creates a
-- contact, so the owner trying their assistant three times would find three
-- nameless strangers in their client list.

alter table contacts
  add column is_test boolean not null default false;

create index contacts_real_idx
  on contacts (studio_id, created_at desc)
  where is_test = false;

comment on column contacts.is_test is
  'Created by an owner rehearsing with their own assistant. Hidden from the client list.';
