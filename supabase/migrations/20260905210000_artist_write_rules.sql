-- Who may change a person's record, enforced where it cannot be talked round.
--
-- Every table in this product is readable and writable by any member of the
-- business, which is right for a diary and wrong for people. A member of staff
-- could change a colleague's hourly rate, or the owner's, or delete them.
--
-- The application already refuses. That is not enough: the anon key is public
-- by design and every signed-in browser holds a session token, so anybody who
-- can use a developer console can speak to the database directly and never
-- touch our code. A rule that only exists in the application is a rule for
-- people who use the buttons.
--
-- Reading stays open to the whole business. The diary shows everybody, the
-- assistant quotes from everybody's rates, and a shop where colleagues cannot
-- see each other does not work.
create or replace function is_studio_owner(target uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from studio_members m
    where m.studio_id = target
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

comment on function is_studio_owner is
  'Whether the caller owns this business. security definer, so the policy can read studio_members without recursing into its own policy.';

drop policy if exists artists_rw on artists;

create policy artists_read on artists for select
  using (is_studio_member(studio_id));

-- Adding somebody to the business, or removing them, is the owner's.
create policy artists_owner_write on artists for insert
  with check (is_studio_owner(studio_id));

create policy artists_owner_delete on artists for delete
  using (is_studio_owner(studio_id));

/*
 * Changing a record: the owner, or the person it describes.
 *
 * Somebody's hours, rates and days off are theirs to keep up to date — making
 * them ask is how those stop being accurate. The `with check` matters as much
 * as the `using`: without it somebody could edit their own row and, in the
 * same statement, move it to another business or hand it to somebody else.
 */
create policy artists_update on artists for update
  using (is_studio_owner(studio_id) or user_id = auth.uid())
  with check (is_studio_owner(studio_id) or user_id = auth.uid());
