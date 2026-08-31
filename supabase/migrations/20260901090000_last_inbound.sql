-- When the customer last wrote.
--
-- Not the same as last_message_at, which moves whenever anybody sends —
-- including the owner. Meta measures its 24-hour reply window from the
-- customer's own last message, so an owner replying at 5pm must not make the
-- window look open at 9am the next day when in truth it shut hours ago.
--
-- Getting this wrong is not a cosmetic bug. The screen would offer to send a
-- message that WhatsApp then refuses, and the owner would believe it went.

alter table conversations
  add column last_inbound_at timestamptz;

comment on column conversations.last_inbound_at is
  'When the customer last sent a message. Drives the 24-hour messaging window; null means they never have.';

-- Existing threads, from what is already in the table.
update conversations c
   set last_inbound_at = m.latest
  from (
        select conversation_id, max(created_at) as latest
          from messages
         where role = 'client'
      group by conversation_id
       ) m
 where m.conversation_id = c.id;

create or replace function touch_last_inbound()
returns trigger
language plpgsql
-- Definer, so the column is maintained no matter who inserted the message —
-- the widget, a Meta webhook, or the owner. A row that skips this because of
-- row-level security would silently hold a stale window.
security definer
set search_path = public
as $$
begin
  if new.role = 'client' then
    update conversations
       set last_inbound_at = new.created_at
     where id = new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger messages_touch_last_inbound
  after insert on messages
  for each row execute function touch_last_inbound();
