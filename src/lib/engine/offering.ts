import type { Artist } from "../types.ts";

/**
 * The people an assistant may offer, given whose link this is.
 *
 * Exported and pure so the rule can be tested directly: getting it wrong
 * either hides somebody who is available or sells time belonging to somebody
 * who never agreed to it, and neither is visible from the outside until a
 * customer is standing in the wrong shop.
 */
export function whoCanBeOffered(
  artists: Artist[],
  studio: { offers_artists?: string[] | null },
  forArtist?: Artist | null,
  /**
   * Which channel the customer arrived on.
   *
   * The website is the shop window — one address, and whoever the owner has
   * decided it speaks for. Every other channel is somebody's own: a text goes
   * to one person's number, an Instagram message to one person's account, and
   * the person on the other end is asking that person. Offering a colleague's
   * diary down somebody's private number would be answering a question nobody
   * asked, on a phone that is not ours.
   */
  channel: string = "web",
): Artist[] {
  const active = artists.filter((a) => a.active);

  if (forArtist) {
    /*
     * Their own link, or their own number. Themselves first, always —
     * somebody who scanned a code on one person's card is asking for that
     * person.
     */
    const onTheirOwnChannel = channel !== "web";
    const scope = onTheirOwnChannel ? "only_me" : (forArtist.agent_scope ?? "only_me");
    if (scope === "only_me") return active.filter((a) => a.id === forArtist.id);

    const others = active.filter((a) => a.id !== forArtist.id);
    const me = active.filter((a) => a.id === forArtist.id);
    return [...me, ...others];
  }

  /*
   * The business's widget. Whoever the owner has named, and everybody active
   * when they have not named anybody — which is every business today.
   *
   * An empty list is treated as "not chosen" rather than "nobody", because a
   * business whose assistant can offer no one cannot answer at all, and that
   * is far more likely to be a mistake than an intention.
   */
  const chosen = studio.offers_artists;
  if (!chosen?.length) return active;

  const named = active.filter((a) => chosen.includes(a.id));
  return named.length ? named : active;
}
