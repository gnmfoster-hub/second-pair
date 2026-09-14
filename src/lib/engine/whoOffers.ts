/**
 * Who may be offered for each thing on a named price list.
 *
 * The assistant has always read a map of who does what, keyed by the id of the
 * thing being asked about, with "nobody named means everybody" as the rule.
 * That map was only ever filled in for price bands — a business pricing by a
 * named list had nothing, so the assistant believed everybody did everything
 * and would offer a junior for balayage at a price she never set.
 *
 * It is stored the other way round from how it is read, on purpose. A business
 * records the exceptions — "Jade does not do colour" — because that is the
 * short list and the one somebody can keep true. The assistant wants the
 * opposite, so the flip happens here, once, where it can be tested.
 *
 * Pure, and separate from anything that talks to a database, because "who is
 * allowed to be offered this work" is the kind of mistake that is invisible
 * until a customer is standing in front of somebody who cannot do it.
 */

export type Refusal = { service_id: string; artist_id: string };

/**
 * The one id that can never match anybody.
 *
 * Exported so the reason travels with it: an empty list would read as "nobody
 * named", which means everybody, and the assistant would offer the first name
 * on the roster for work nobody in the building does.
 */
export const NOBODY = "nobody";

export function whoOffers(
  serviceIds: readonly string[],
  refusals: readonly Refusal[],
  artists: readonly { id: string; active?: boolean | null }[],
): Record<string, string[]> {
  const wanted = new Set(serviceIds);

  const refuses = new Map<string, Set<string>>();
  for (const row of refusals) {
    if (!wanted.has(row.service_id)) continue;
    const theirs = refuses.get(row.service_id) ?? new Set<string>();
    theirs.add(row.artist_id);
    refuses.set(row.service_id, theirs);
  }

  const out: Record<string, string[]> = {};

  for (const [serviceId, theirs] of refuses) {
    const willing = artists
      .filter((a) => a.active !== false && !theirs.has(a.id))
      .map((a) => a.id);

    /*
     * Everything with no exception against it is left out of the map
     * entirely, which is what keeps the common case free: a business where
     * everybody does everything writes no rows, gets no entries, and the rule
     * the assistant has always used is untouched.
     */
    out[serviceId] = willing.length ? willing : [NOBODY];
  }

  return out;
}
