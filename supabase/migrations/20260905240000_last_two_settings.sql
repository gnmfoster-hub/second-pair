-- The last two, found by finishing the sweep rather than assuming it was done.
--
-- Who offers which service decides which people the assistant will put in
-- front of a customer asking for a particular thing. Changing it is changing
-- what the business sells and who sells it.
--
-- A reminder template is words sent to a customer in the business's name, the
-- evening before their appointment, with nobody watching. Of everything staff
-- could reach, it is the one that speaks to the public unattended.
--
-- Reading both stays open. Staff need to know what the assistant will offer on
-- their behalf, and what their customers are about to be sent.
drop policy if exists "studio members manage who does what" on service_providers;

create policy who_does_what_read on service_providers for select
  using (
    exists (
      select 1 from artists a
      where a.id = service_providers.artist_id and is_studio_member(a.studio_id)
    )
  );

create policy who_does_what_owner on service_providers for all
  using (
    exists (
      select 1 from artists a
      where a.id = service_providers.artist_id and is_studio_owner(a.studio_id)
    )
  )
  with check (
    exists (
      select 1 from artists a
      where a.id = service_providers.artist_id and is_studio_owner(a.studio_id)
    )
  );

drop policy if exists reminder_templates_rw on reminder_templates;
drop policy if exists "studio members manage reminder templates" on reminder_templates;

create policy reminder_templates_read on reminder_templates for select
  using (is_studio_member(studio_id));

create policy reminder_templates_owner on reminder_templates for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));
