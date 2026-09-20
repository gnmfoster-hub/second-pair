-- The inbox is ordered by last_message_at, and twenty places kept it by hand.
--
-- Giles rang the live Neat & Tidy number, got the text back, and could not find
-- the call in the inbox. It was in there. Its thread said its last message was
-- three days old, so it sat below a week of older conversations. That one path
-- was fixed by hand the same morning, and this is the reason it was worth
-- looking further: seven of sixty-one conversations were already stale, four of
-- them by days, written by four different paths.
--
-- Twenty files insert into messages. Every one of them has to remember to bump
-- the thread afterwards, and a field kept correct by twenty separate people
-- remembering is a field that is wrong. It is not a thing the callers should be
-- trusted with, because forgetting has no symptom: the message is saved, the
-- screen shows it when opened, and the only sign is a thread sitting lower down
-- a list than it should.
--
-- So the database does it. After this, a message cannot be written without its
-- thread moving to the top, whoever wrote it and whether or not they remembered.
-- The hand-written updates still in the code become harmless: they set it to
-- the same moment this does.
--
-- greatest, not plain assignment, for the two places that write with a date of
-- their own. The demo refresh backdates a whole conversation so it reads as a
-- week's work, and a message imported with an older timestamp must not drag a
-- live thread backwards.

create or replace function bump_last_message() returns trigger
language plpgsql
as $$
begin
  update conversations
     set last_message_at = greatest(last_message_at, new.created_at)
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_last_message on messages;

create trigger messages_bump_last_message
  after insert on messages
  for each row
  execute function bump_last_message();

-- And the ones already wrong, put right.
--
-- Only ever forwards. A thread whose stamp is newer than its newest message is
-- not evidence of this fault: an empty conversation is stamped when it is
-- created, before anybody has said anything.

update conversations c
   set last_message_at = m.newest
  from (
    select conversation_id, max(created_at) as newest
      from messages
     group by conversation_id
  ) m
 where m.conversation_id = c.id
   and m.newest > c.last_message_at;
