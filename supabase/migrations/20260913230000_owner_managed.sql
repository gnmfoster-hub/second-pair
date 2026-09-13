-- Whether this person runs their own settings, or the business does.
--
-- Two kinds of person work in the same salon and the product has been treating
-- them as one. A chair renter is a business inside a business: her prices, her
-- reminders, her own booking link, her own assistant name. An employee has a
-- diary and a wage, and everything a customer sees is the shop's — the owner
-- decides the prices, the wording, the reminders, and does not want a stylist
-- quietly changing any of it.
--
-- The same is true well outside hairdressing. A garage's mechanics are
-- employed; the mobile therapist renting a room upstairs is not.
--
-- Off by default, which keeps every business exactly as it is today. Somebody
-- with no login sees none of these screens either way, so this only ever
-- changes what a person who signs in is allowed to touch.
alter table artists
  add column if not exists owner_managed boolean not null default false;

comment on column artists.owner_managed is
  'True means the business sets this person''s prices, reminders, hours and wording. Their phone and their own calendar stay theirs — nobody else can press a button on somebody''s phone.';

/*
 * And the policies that let a person write their own settings have to agree.
 *
 * Without this the screens would hide the controls and the database would go
 * on accepting the writes, which is a permission in the same sense a locked
 * door with the key in it is a lock.
 *
 * The owner's own policies are untouched and already cover everything here, so
 * an owner-managed person loses the ability to write their own rows and the
 * owner keeps the ability to write them on their behalf.
 */
drop policy if exists service_people_own on service_people;
create policy service_people_own on service_people for all
  using (exists (
    select 1 from artists a
    where a.id = service_people.artist_id
      and a.user_id = auth.uid()
      and a.owner_managed = false
  ))
  with check (exists (
    select 1 from artists a
    where a.id = service_people.artist_id
      and a.user_id = auth.uid()
      and a.owner_managed = false
  ));

drop policy if exists services_own on services;
create policy services_own on services for all
  using (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = services.artist_id
        and a.user_id = auth.uid()
        and a.owner_managed = false
    )
  )
  with check (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = services.artist_id
        and a.user_id = auth.uid()
        and a.owner_managed = false
    )
  );

drop policy if exists reminder_templates_own on reminder_templates;
create policy reminder_templates_own on reminder_templates for all
  using (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = reminder_templates.artist_id
        and a.user_id = auth.uid()
        and a.owner_managed = false
    )
  )
  with check (
    artist_id is not null
    and exists (
      select 1 from artists a
      where a.id = reminder_templates.artist_id
        and a.user_id = auth.uid()
        and a.owner_managed = false
    )
  );
