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
   * the person on the other end is asking that person.
   *
   * Which is why "only me" is the default on a channel of somebody's own, and
   * no longer why it is the rule. See below.
   */
  channel: string = "web",
): Artist[] {
  /*
   * Working here, and somebody the assistant may speak for.
   *
   * Two different questions, and only one of them was being asked. An
   * apprentice has a diary, takes the work the owner books into it, and should
   * not be offered to a stranger who asks for somebody to come out — and a
   * receptionist has a login and no diary at all. "In the diary" was doing
   * both jobs, so the only way to keep somebody off the channels was to take
   * away their diary with it.
   *
   * Absent means yes, so every business that has never touched it is unchanged
   * and a deploy landing before its migration behaves exactly as before.
   */
  const active = artists.filter((a) => a.active && a.assistant_books !== false);

  if (forArtist) {
    /*
     * Their own link, or their own number. Themselves first, always —
     * somebody who scanned a code on one person's card is asking for that
     * person.
     */
    /*
     * What they chose, on every channel of theirs.
     *
     * This forced "only me" on anything that was not the website and read the
     * setting only on the web link — so a stylist who had chosen "me first,
     * then anyone" got that on her booking page and not on her own number,
     * which is the channel she was thinking of when she chose it. The setting
     * existed, was saved, was shown back to her, and was overridden.
     *
     * The reasoning behind the override was sound and it is still the default:
     * somebody texting one person's number is asking that person, and being
     * offered a colleague is answering a question nobody asked. That is why
     * "only me" is what everybody has until they say otherwise. It is not a
     * reason to refuse somebody who has said otherwise — a stylist fully
     * booked in August would rather her regulars were offered Mo than told no.
     */
    const scope = forArtist.agent_scope ?? "only_me";
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
