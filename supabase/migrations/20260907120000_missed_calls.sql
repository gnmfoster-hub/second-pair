-- Where a call to this number should ring before we give up on it.
--
-- A missed call is the most ordinary way a one-person business loses work: the
-- phone goes while they are up a ladder, it rings out, and that customer rings
-- the next name on the list. There is nothing to answer afterwards.
--
-- So the call is offered to them first and only becomes a text if nobody
-- picks up. This is the number it rings — their actual mobile, which is not
-- the same as the number the customer dialled and must never be shown to
-- anybody.
--
-- On the connection rather than on the studio, because a number that belongs
-- to one person should ring that person. Sarah's number rings Sarah; the
-- shop's number rings whoever the shop says.
--
-- Null means do not ring anybody: the text goes out at once. That is a real
-- choice for somebody who would rather not be interrupted at all, and it is
-- also what happens before anyone has filled this in.
alter table channel_connections
  add column if not exists forward_to text;

comment on column channel_connections.forward_to is
  'Where a call to this number rings first. Null texts the caller straight away.';
