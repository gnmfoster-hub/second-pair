-- Things a business types over and over, typed once.
--
-- Not run yet. Nothing changes until it is: the client page reads an absent
-- table as "no saved messages" and simply shows the box it always showed.
--
-- Giles: "would be good to be able to send emails/messages to the clients in
-- the client page record a copy and have templates etc."
--
-- The copy was already kept — a message sent from a client's page is written
-- into their conversation with the delivery recorded beside it, which is why
-- it shows under Conversations. This is the other half: the wording.
--
-- Every business has five or six messages it sends constantly. Running late.
-- A cancellation has come up. Your appointment is confirmed for the new time.
-- Sorry we missed you. Each one gets retyped, slightly differently, several
-- times a week, and the third version is never as good as the first.
--
-- Deliberately not reminder_templates. Those are scheduled against an
-- appointment and sent by the machine; these are picked by a person, in the
-- moment, and edited before they go. Same shape, different job, and joining
-- them would mean every quick message needing an hours_before that means
-- nothing.
--
-- The same {{name}} placeholders as reminders, on purpose. A business that has
-- learnt one way of writing a template should not have to learn a second.

create table if not exists message_templates (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  label       text not null,
  body        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists message_templates_studio_idx
  on message_templates (studio_id, sort_order);

alter table message_templates enable row level security;

-- Same shape as every other table here: a business reads and writes its own
-- and can never see anybody else's. The service key, which the sending code
-- uses, bypasses this by design.
drop policy if exists "own message templates" on message_templates;
create policy "own message templates" on message_templates
  for all
  using (
    studio_id in (
      select studio_id from studio_members where user_id = auth.uid()
    )
  )
  with check (
    studio_id in (
      select studio_id from studio_members where user_id = auth.uid()
    )
  );

comment on table message_templates is
  'Wordings a business picks from when messaging a client by hand. Not reminders: chosen by a person and edited before sending, never scheduled.';
