-- Reminders.
--
-- Two tables, because the message and the sending of it are different things:
--
--   reminder_templates  what this business sends, and how long before
--   reminders           one row per appointment per template, so a reminder is
--                       sent exactly once and its history is auditable
--
-- Seeded from the vertical pack and editable afterwards. The preparation for a
-- tattoo, a colour treatment and a boiler service have nothing in common, and a
-- wrong reminder is worse than no reminder.

create type reminder_status as enum ('pending', 'sent', 'failed', 'skipped');

create table reminder_templates (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,
  label        text not null,
  hours_before integer not null check (hours_before > 0 and hours_before <= 720),
  body         text not null,
  enabled      boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (studio_id, hours_before)
);
create index on reminder_templates (studio_id, sort_order);

create table reminders (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  template_id uuid references reminder_templates(id) on delete set null,
  due_at      timestamptz not null,
  status      reminder_status not null default 'pending',
  -- Rendered at send time, so an edited template does not rewrite history.
  body        text,
  channel     channel,
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now(),
  -- One reminder per booking per template, whatever happens upstream.
  unique (booking_id, template_id)
);
create index reminders_due_idx on reminders (due_at) where status = 'pending';

alter table reminder_templates enable row level security;
alter table reminders enable row level security;

create policy reminder_templates_rw on reminder_templates for all
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

create policy reminders_rw on reminders for all
  using (exists (
    select 1 from bookings b
    join artists a on a.id = b.artist_id
    where b.id = booking_id and is_studio_member(a.studio_id)))
  with check (exists (
    select 1 from bookings b
    join artists a on a.id = b.artist_id
    where b.id = booking_id and is_studio_member(a.studio_id)));

create trigger reminder_templates_set_updated_at
  before update on reminder_templates
  for each row execute function set_updated_at();

-- Same PostgREST batch-insert trap as everywhere else: a row omitting a key
-- another row in the batch has is sent an explicit NULL, not the default.
create or replace function reminder_templates_fill_defaults() returns trigger
language plpgsql as $fn$
begin
  new.sort_order := coalesce(new.sort_order, 0);
  new.enabled    := coalesce(new.enabled, true);
  return new;
end;
$fn$;

create trigger reminder_templates_defaults
  before insert on reminder_templates
  for each row execute function reminder_templates_fill_defaults();
