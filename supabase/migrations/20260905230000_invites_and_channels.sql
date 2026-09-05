-- Two more, and the first is the one that matters.
--
-- A member of staff could create an invitation — which is to say, hand out a
-- login to the business, to any address they chose. Somebody with the smallest
-- amount of access could give themselves a second account, or give one to
-- somebody outside the business entirely, and nothing would have stopped them.
-- That is not a settings problem, it is a way in.
--
-- And they could connect or disconnect the business's messaging channels,
-- which is how every text and Instagram message reaches it. Disconnecting one
-- is silent: enquiries simply stop arriving, and nobody is told.
--
-- The application already refuses both. As everywhere else this week, that is
-- the wrong place for the rule to live on its own.

drop policy if exists "studio members manage invites" on team_invites;

/*
 * Invitations are the owner's entirely, including reading them.
 *
 * A pending invitation is a token that becomes access to the business. There
 * is no reason for anybody but the person who sent it to see one, and every
 * reason for the list not to be readable by whoever happens to be signed in.
 */
create policy invites_owner on team_invites for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));

drop policy if exists "studio members manage channel connections" on channel_connections;

-- Read stays with the business: the app shows which channels are live, and
-- staff should be able to see how customers reach them.
create policy channels_read on channel_connections for select
  using (is_studio_member(studio_id));

create policy channels_owner on channel_connections for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));
