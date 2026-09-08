-- Answering the same message twice is worse than answering it late.
--
-- Meta gives a webhook about twenty seconds and retries anything slower. A
-- reply that needs the model can take longer than that on a bad day, so the
-- honest assumption is that some deliveries arrive twice — and the second one
-- looks exactly like a customer having asked again.
--
-- Every message Meta sends carries its own id. Writing it down first, and
-- letting the primary key refuse a duplicate, means a retry stops before it
-- reaches the assistant rather than after.
create table if not exists handled_messages (
  message_id text primary key,
  channel    channel not null,
  seen_at    timestamptz not null default now()
);

-- Nothing needs these after a day or two; the sweep clears them.
create index if not exists handled_messages_seen_idx on handled_messages (seen_at);

alter table handled_messages enable row level security;
-- No policies: written and read by the server only, and it holds nothing about
-- anybody — an opaque id from Meta and a timestamp.

comment on table handled_messages is
  'Message ids already answered, so a webhook retry cannot reply twice.';
