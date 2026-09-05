-- A person's own channels are theirs.
--
-- Tightening these to the owner last night was half right. The business's own
-- channels — the widget on the website, the shop's number — are the owner's.
-- But a stylist's own Instagram account, or her own mobile, is hers: she
-- connects it, she disconnects it, and having to ask somebody else to do it is
-- how it never gets done.
--
-- The distinction is already in the table. A connection with no artist_id
-- belongs to the business; one with an artist_id belongs to that person.
create or replace function owns_artist(target uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from artists a
    where a.id = target and a.user_id = auth.uid()
  );
$$;

comment on function owns_artist is
  'Whether the caller is the person this record describes. security definer, so a policy can read artists without recursing into its own.';

/*
 * Their own, alongside the owner's existing rights.
 *
 * A separate policy rather than a widened one: policies are permissive and
 * combine with OR, so this adds what a person may do to their own without
 * touching what the owner may do to everything.
 *
 * The `with check` is what stops somebody connecting a channel and pointing it
 * at a colleague — or at nobody, which would make it the business's.
 */
create policy channels_own on channel_connections for all
  using (artist_id is not null and owns_artist(artist_id))
  with check (artist_id is not null and owns_artist(artist_id));
