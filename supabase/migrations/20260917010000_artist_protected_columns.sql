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
-- Accepting an invitation is the one time a login is attached to a record:
-- accept_team_invite runs as the invited person and sets user_id on a row
-- that has none. That case is allowed here explicitly, and tested on the demo
-- with a throwaway login after this was applied.
--
-- What a managed person may not change — their rates, hours and the voice the
-- assistant uses for them — is enforced in the app (priceActions, the person
-- editor, myServiceActions) rather than here. It belongs here too and can be
-- added later; it was left out to keep this short enough to paste into the
-- Supabase SQL editor, which truncated a longer version.
--
-- Run on 16 September 2026. Kept short and comment-free inside the function:
-- a comment inside an IF condition reads as part of the expression, and the
-- editor splits a long paste, which is how the first two attempts failed.

create or replace function artists_guard_own_update()
returns trigger language plpgsql security definer set search_path = public
as $function$
begin
  if auth.uid() is null or is_studio_owner(old.studio_id) then
    return new;
  end if;
  if new.studio_id is distinct from old.studio_id
     or new.owner_managed is distinct from old.owner_managed
     or new.stripe_account_id is distinct from old.stripe_account_id
     or (new.user_id is distinct from old.user_id
         and not (old.user_id is null and new.user_id = auth.uid()))
  then
    raise exception 'Only the owner can change that.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists artists_guard_own_update on artists;

create trigger artists_guard_own_update
  before update on artists
  for each row execute function artists_guard_own_update();
