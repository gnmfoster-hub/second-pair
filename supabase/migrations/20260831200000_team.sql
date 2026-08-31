-- A team, rather than a list of names.
--
-- Two things were missing, and one of them was a live bug.
--
-- The bug: opening hours were the business's only. A stylist who works
-- Tuesday, Thursday and Saturday could not be described, so the assistant
-- offered her a Monday and the salon found out when somebody turned up.
--
-- The gap: an `artists` row and a login had nothing connecting them, so a
-- stylist could not sign in, could not see her own diary, and could not
-- connect her own Instagram — which is exactly how a salon works.
--
-- The model, and why:
--
--   The owner sets the business up and its defaults. Each person is added as
--   an artist whether or not they ever log in — plenty of staff will not want
--   to, and a business must work for them either way. The owner can then
--   invite someone, which attaches their login to their existing row.
--
--   That order matters. If people registered themselves and then asked to
--   join, the owner would have an approval queue and a name-matching problem.
--   An invite carries the exact person it attaches to, so there is nothing to
--   match and nothing to approve.

alter table artists
  -- Who they are when they sign in. Null means somebody the owner manages and
  -- who never logs in at all, which must stay a first-class option.
  add column user_id uuid references auth.users(id) on delete set null,

  -- Their own working week. Null means "same as the business", which is what
  -- almost every one-person business wants and what everyone starts as.
  add column hours jsonb,

  -- Their own words, for their own link and their own Instagram. Null means
  -- the business's, so nobody has to write anything to get started.
  add column greeting text,
  add column tone text;

create unique index artists_user_id_key on artists (user_id) where user_id is not null;

comment on column artists.hours is
  'This person''s working week, same shape as studios.hours. Null follows the business.';
comment on column artists.user_id is
  'Their login, once they accept an invite. Null is a perfectly normal team member who never signs in.';

-- ---------------------------------------------------------------- invitations

create table team_invites (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios(id) on delete cascade,
  -- The person this invite attaches to. Deleting them cancels it.
  artist_id  uuid not null references artists(id) on delete cascade,

  -- The whole security model: the URL is the credential, so it is long and
  -- random. Rotating it is how an invite is withdrawn.
  token      text not null default new_calendar_token(),

  email      text,
  role       member_role not null default 'staff',

  -- Invites do not linger. A link found in an old message a year later must
  -- not still let somebody into a business.
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index team_invites_token_key on team_invites (token);
-- One live invite per person; re-inviting replaces rather than accumulates.
create unique index team_invites_pending_key
  on team_invites (artist_id) where accepted_at is null;

alter table team_invites enable row level security;

-- Only the business can see or make its own invites. Accepting one is done by
-- a security-definer function below, because the person accepting is by
-- definition not a member yet.
create policy "studio members manage invites" on team_invites
  for all
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

/**
 * Accepting an invite.
 *
 * Runs as definer because the caller cannot pass the membership check yet —
 * that is the entire point of the invite. Everything it needs to trust is
 * checked here instead: the token exists, it has not expired, it has not been
 * used, and the person is signed in.
 */
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

  -- Attach the login to the person they were invited as.
  update artists set user_id = auth.uid() where id = found.artist_id;

  update team_invites set accepted_at = now() where id = found.id;

  return found.studio_id;
end;
$fn$;
