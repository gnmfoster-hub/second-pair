/**
 * Whose enquiries a person sees.
 *
 * A worker's inbox is theirs — the screen they open between clients has to be
 * about them, not about everybody in the shop. The owner sees their own too,
 * but can look at anybody's when something needs sorting out.
 *
 * One function because two places ask: the list itself and the count on the
 * sidebar. They were written separately, and a badge saying three above a list
 * showing one is worse than no badge — it sends somebody looking for work that
 * was never theirs.
 */

export type Scope =
  /** Only this person's. */
  | { kind: "mine"; artistId: string }
  /** This person's, plus anything nobody has claimed. */
  | { kind: "mine_and_unclaimed"; artistId: string }
  /** One named person's, because the owner has asked to see them. */
  | { kind: "somebody"; artistId: string }
  /** Everything, because the owner has asked for it. */
  | { kind: "everyone" }
  /** Only the unclaimed — a login with no diary of their own. */
  | { kind: "unclaimed" };

export function inboxScope({
  owns,
  artistId,
  whose,
}: {
  owns: boolean;
  /** Their own person record, when they have one. */
  artistId: string | null;
  /** What the owner has asked to see, from the address bar. */
  whose?: string | null;
}): Scope {
  /*
   * Somebody with a login and no diary of their own — a manager, an
   * administrator. They are here to answer people, so they get the enquiries
   * nobody has claimed rather than an empty screen.
   */
  if (!artistId && !owns) return { kind: "unclaimed" };

  if (owns) {
    if (whose === "everyone") return { kind: "everyone" };
    /*
     * A named person, but only somebody real. An id from the address bar that
     * matches nobody would otherwise silently show an empty inbox, which reads
     * as "no enquiries" rather than "no such person".
     */
    if (whose) return { kind: "somebody", artistId: whose };
    /*
     * Otherwise their own, plus anything unclaimed. A website enquiry can
     * arrive before a person is chosen, and those belong to whoever runs the
     * place until they are — sending them nowhere would lose them, which is
     * the one outcome worth avoiding on this screen.
     */
    return artistId
      ? { kind: "mine_and_unclaimed", artistId }
      : { kind: "unclaimed" };
  }

  return { kind: "mine", artistId: artistId as string };
}

/**
 * Narrows a conversations query to what somebody may see.
 *
 * Applied by both the list and the badge, so the number can never describe a
 * different set of rows from the screen it sits on.
 */
export function scopedTo<T extends { eq: (c: string, v: unknown) => T; is: (c: string, v: null) => T; or: (f: string) => T }>(
  query: T,
  scope: Scope,
): T {
  switch (scope.kind) {
    case "everyone":
      return query;
    case "unclaimed":
      return query.is("artist_id", null);
    case "mine":
    case "somebody":
      return query.eq("artist_id", scope.artistId);
    case "mine_and_unclaimed":
      return query.or(`artist_id.eq.${scope.artistId},artist_id.is.null`);
  }
}
