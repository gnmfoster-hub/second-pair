-- The conversation a request came out of.
--
-- The help assistant can now open a request when it cannot answer something
-- itself. Without this it would open another one every time the same
-- conversation asked again, and somebody stuck on one problem for ten minutes
-- would arrive as ten separate requests.
--
-- Nullable: a request typed on the help page has no conversation behind it,
-- and that is the ordinary case.
alter table support_tickets
  add column if not exists from_conversation_id uuid references conversations(id) on delete set null;

-- One request per conversation. Enforced here rather than by checking first,
-- because two escalations landing together would both pass a check.
create unique index if not exists support_tickets_one_per_conversation
  on support_tickets (from_conversation_id)
  where from_conversation_id is not null;
