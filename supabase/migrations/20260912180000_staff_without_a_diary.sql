-- Somebody who works here but is not in the diary.
--
-- A receptionist, a manager, an apprentice who answers the phone. They need a
-- login, the inbox and a view of everybody's day; they do not need hours,
-- rates, a column, or to be offered to a customer by the assistant.
--
-- Done by letting an invitation exist without an artist rather than by adding a
-- flag to artists. A flag would have to be honoured in the ten places that ask
-- whether somebody is active — the diary, the client list, the pricing page,
-- readiness, and every inbound channel — and the first one missed would put a
-- receptionist in the diary, or worse, offer her to a customer as a stylist.
-- No artist row means there is nothing to filter and nothing to forget.
alter table team_invites
  alter column artist_id drop not null;

-- The partial index kept one open invite per person; with no person there is
-- nobody to keep it for, so it only applies where there is one.
drop index if exists team_invites_pending_key;
create unique index if not exists team_invites_pending_key
  on team_invites (artist_id) where accepted_at is null and artist_id is not null;

-- Same function, minus the assumption that every invitation names somebody in
-- the diary. Everything else about accepting is unchanged.
create or replace function accept_team_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  found team_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select * into found
  from team_invites
  where token = invite_token
    and accepted_at is null
    and expires_at > now();

  if not found.id is not null then
    raise exception 'that invitation is not valid any more';
  end if;

  -- Idempotent: joining a business you are already in is not an error.
  insert into studio_members (studio_id, user_id, role)
  values (found.studio_id, auth.uid(), found.role)
  on conflict (studio_id, user_id) do nothing;

  -- Attach the login to the person they were invited as, when there is one.
  -- Reception staff have no row here, and that is the whole of the difference.
  if found.artist_id is not null then
    update artists set user_id = auth.uid() where id = found.artist_id;
  end if;

  update team_invites set accepted_at = now() where id = found.id;

  return found.studio_id;
end;
$fn$;
