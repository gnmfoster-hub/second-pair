-- Support, asked for and answered in writing.
--
-- The alternative was letting the platform administrator into a business to
-- look around, which would mean seeing their customers' conversations — and the
-- privacy notice tells every one of those customers that nobody else on Second
-- Pair can read what they wrote. A ticket gets the context without the access:
-- the owner says what is wrong, in their own words, and the answer comes back
-- to the same place.
--
-- It also leaves a record inside their own account, which a phone call does
-- not. Six months later "what did we agree about the deposits" has an answer.

create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  -- Who raised it. Kept even after they leave, so the thread still makes sense.
  opened_by   uuid references auth.users(id) on delete set null,
  subject     text not null,
  status      text not null default 'open'
              check (status in ('open', 'answered', 'closed')),
  -- Set when support replies, so a business can see it has been picked up
  -- without opening it.
  answered_at timestamptz,
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists support_tickets_studio_idx on support_tickets (studio_id, status);
create index if not exists support_tickets_open_idx on support_tickets (status, updated_at desc);

create table if not exists support_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references support_tickets(id) on delete cascade,
  -- 'owner' or 'support'. Not a user id: which side said it is what matters
  -- when reading it back, and support is a role rather than a person.
  author     text not null check (author in ('owner', 'support')),
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx on support_messages (ticket_id, created_at);

alter table support_tickets enable row level security;
alter table support_messages enable row level security;

-- A business sees its own tickets and nobody else's. The administrator reads
-- these through the service role, which bypasses this entirely — there is
-- deliberately no policy granting anybody cross-studio access.
create policy "own tickets" on support_tickets
  for all using (is_studio_member(studio_id)) with check (is_studio_member(studio_id));

create policy "own ticket messages" on support_messages
  for all using (
    exists (
      select 1 from support_tickets t
      where t.id = support_messages.ticket_id and is_studio_member(t.studio_id)
    )
  )
  with check (
    exists (
      select 1 from support_tickets t
      where t.id = support_messages.ticket_id and is_studio_member(t.studio_id)
    )
  );
