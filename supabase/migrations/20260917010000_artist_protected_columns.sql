-- What somebody may change about themselves, and what only the owner may.
--
-- The update policy on artists lets the owner or the person the row describes
-- change it, which is right for hours, rates and days off. But it lets the
-- person change every column, and the app is not the only way in: anybody
-- signed in can call the database directly with their own session. So a
-- member of staff could:
--
--   * move themselves to another business (studio_id), appearing in its diary
--     and on its website;
--   * switch off owner_managed, undoing every "the business sets this" rule;
--   * point stripe_account_id at an account of their choosing, so payments
--     taken for them land there;
--   * hand the row to another login (user_id).
--
-- "Taking bookings" (active) stays theirs: the person editor offers it, and
-- somebody switching themselves off for a fortnight is a normal thing to do.
--
-- A policy cannot compare old and new values column by column, so this is a
-- trigger. It only applies to a signed-in caller who is not the owner; the
-- server's own client (auth.uid() is null) — the Stripe connect callback, the
-- back office — is unaffected, because the app checks those itself.
--
-- For somebody the business looks after (owner_managed), their rates, hours
-- and what the assistant says for them are the business's too, which the app
-- already enforces and this now backs up.

create or replace function artists_guard_own_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_studio_owner(old.studio_id) then
    return new;
  end if;

  if new.studio_id is distinct from old.studio_id
    -- Accepting an invite claims an unclaimed row for yourself, and nothing
    -- else changes a login. The row-level policy already stops anybody
    -- reaching an unclaimed row directly; accept_team_invite does it after
    -- checking the invite.
    or (new.user_id is distinct from old.user_id
        and not (old.user_id is null and new.user_id = auth.uid()))
    or new.owner_managed is distinct from old.owner_managed
    or new.stripe_account_id is distinct from old.stripe_account_id
  then
    raise exception 'Only the owner can change that.' using errcode = '42501';
  end if;

  if old.owner_managed is true and (
    new.hourly_rate_pence is distinct from old.hourly_rate_pence
    or new.min_charge_pence is distinct from old.min_charge_pence
    or new.day_rate_pence is distinct from old.day_rate_pence
    or new.hours is distinct from old.hours
    or new.styles is distinct from old.styles
    or new.agent_scope is distinct from old.agent_scope
    or new.reminders_own is distinct from old.reminders_own
    or new.travel_buffer_minutes is distinct from old.travel_buffer_minutes
    or new.greeting is distinct from old.greeting
    or new.tone is distinct from old.tone
    or new.assistant_name is distinct from old.assistant_name
  ) then
    raise exception 'The business sets this for you.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists artists_guard_own_update on artists;

create trigger artists_guard_own_update
  before update on artists
  for each row execute function artists_guard_own_update();

comment on function artists_guard_own_update is
  'Stops a non-owner changing which business, login, Stripe account or management a person row has, and a managed person changing what the business sets.';
