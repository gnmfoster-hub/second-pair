import type { Service, ServicePerson } from "./types";
import { formatPence, formatRange } from "./money.ts";

/**
 * What one person charges for something, and how long they take over it.
 *
 * A senior takes forty minutes over what a junior takes an hour on, and
 * charges more for it. Every real salon with more than one chair works this
 * way, and a single price per service cannot describe it.
 *
 * The price list is still the answer for nearly everything. An override is
 * the exception, and the common case — no row at all — has to cost nothing to
 * express, because a business that has to fill in five people against thirty
 * services will keep its prices on a wall instead.
 */
export type ResolvedPrice = {
  /** How long to block out. Null only where the service itself has no length. */
  minutes: number | null;
  price_pence: number | null;
  /** The top of a range. Always null once somebody has set their own price. */
  price_to_pence: number | null;
  /** Whether either number came from this person rather than the list. */
  theirs: boolean;
};

/**
 * The list's answer, unless this person has given their own.
 *
 * Time and money are taken separately: somebody can be quicker at a thing
 * without charging differently for it, and charge more for a thing without
 * taking longer. Treating them as one override would force whoever sets a
 * price to restate a length they had no opinion about.
 *
 * A person's own price collapses a range. A range describes work that varies
 * — "£120 to £160" — and somebody who names their own number has answered the
 * question the range was asking. Keeping the old top alongside their new
 * bottom would quote a spread neither of them meant.
 */
export function resolvePrice(
  service: Pick<Service, "minutes" | "price_pence" | "price_to_pence">,
  mine?: Pick<ServicePerson, "minutes" | "price_pence"> | null,
): ResolvedPrice {
  const ownPrice = mine?.price_pence ?? null;
  const ownMinutes = mine?.minutes ?? null;

  return {
    minutes: ownMinutes ?? service.minutes,
    price_pence: ownPrice ?? service.price_pence,
    price_to_pence: ownPrice != null ? null : service.price_to_pence,
    theirs: ownPrice != null || ownMinutes != null,
  };
}

/**
 * A price as somebody would say it out loud.
 *
 * "No price set" is said plainly rather than shown as a blank, because a
 * blank in a price list reads as free — and the assistant quotes from this,
 * so the difference between "nothing set" and "nothing to pay" matters.
 */
export function describePrice(p: Pick<ResolvedPrice, "price_pence" | "price_to_pence">): string {
  if (p.price_pence == null) return "no price set";
  if (p.price_to_pence != null && p.price_to_pence !== p.price_pence) {
    return formatRange(p.price_pence, p.price_to_pence);
  }
  return formatPence(p.price_pence);
}

/** Everyone's overrides for one service, keyed by the person they belong to. */
export function byPerson(rows: ServicePerson[]): Map<string, ServicePerson> {
  return new Map(rows.map((r) => [r.artist_id, r]));
}
