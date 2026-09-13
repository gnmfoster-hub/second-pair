-- Three things that belong to a person rather than to the business.
--
-- The pattern this keeps hitting: a setting is right for the whole business
-- until the business has more than one person in it, and then it is wrong for
-- most of them. None of these can be answered once for everybody.

-- ─────────────────────────────────────────────── how long it takes to get there
--
-- Travelling time is padded either side of every job so two cannot be booked
-- back to back across a city. It is one number for the whole business, and a
-- cleaning firm with somebody in a van and somebody on a bike does not have
-- one number.
--
-- Null means the business's, which is what nearly everybody stays on and what
-- every existing row becomes. Zero is a real answer and a different one: it
-- means this person needs no gap at all.
alter table artists
  add column if not exists travel_buffer_minutes integer
    check (travel_buffer_minutes is null
           or (travel_buffer_minutes >= 0 and travel_buffer_minutes <= 240));

comment on column artists.travel_buffer_minutes is
  'Minutes left either side of this person''s jobs. Null uses the business''s; zero means none.';

-- ───────────────────────────────────────────────────────── whose reminders
--
-- Reminder templates belong to the business, so every client of every person
-- gets the same message at the same hour. Some people want that and some want
-- their own — a mobile hairdresser reminding people the night before is not
-- the same business as a tattooist reminding them a week out about aftercare.
--
-- Null is the business's, which is every row that exists today.
alter table reminder_templates
  add column if not exists artist_id uuid references artists(id) on delete cascade;

create index if not exists reminder_templates_artist_idx on reminder_templates (artist_id);

/*
 * One reminder per business per hour, and one per person per hour.
 *
 * The old constraint was unique (studio_id, hours_before), which would now stop
 * a stylist having a 24-hour reminder because the shop already has one.
 *
 * `nulls not distinct` matters and is easy to miss: by default Postgres treats
 * two NULLs as different, so without it the business could hold five identical
 * 24-hour reminders — the exact duplication the original constraint existed to
 * prevent, quietly reintroduced while adding a column.
 */
alter table reminder_templates
  drop constraint if exists reminder_templates_studio_id_hours_before_key;

alter table reminder_templates
  drop constraint if exists reminder_templates_studio_artist_hours_key;

alter table reminder_templates
  add constraint reminder_templates_studio_artist_hours_key
  unique nulls not distinct (studio_id, artist_id, hours_before);

-- Whether this person sends their own, or the business's.
--
-- Off for everybody, including everybody who already exists: nothing changes
-- for anyone until they ask for it. A person who turns this on and has written
-- no templates sends nothing, which is why the screen says so rather than
-- letting somebody switch their reminders off by accident.
alter table artists
  add column if not exists reminders_own boolean not null default false;

comment on column artists.reminders_own is
  'True means this person''s clients get their reminders, not the business''s.';

-- A person may keep their own templates, and nobody else's.
drop policy if exists reminder_templates_own on reminder_templates;
create policy reminder_templates_own on reminder_templates for all
  using (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = reminder_templates.artist_id and a.user_id = auth.uid()
    )
  )
  with check (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = reminder_templates.artist_id and a.user_id = auth.uid()
    )
  );
