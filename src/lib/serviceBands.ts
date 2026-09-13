import type { PriceBand, Service, ServicePerson } from "./types.ts";
import { resolvePrice } from "./servicePrices.ts";

/**
 * A salon's price list, in the shape the assistant already understands.
 *
 * The engine quotes, offers times and books against price bands — size and
 * hours against an hourly rate, which is how a tattooist prices. A salon sells
 * a named thing for a fixed price in a fixed time, and the catalogue it keeps
 * has never reached the assistant at all.
 *
 * Rather than teach the engine a second model — a second prompt section, a
 * second quoting tool, a second way to decide how long to set aside, each with
 * its own way of being subtly wrong — a service is expressed as the band it
 * already is: a flat price with a known duration. Everything downstream works
 * unchanged, and there is one description of what the business sells rather
 * than two that can disagree.
 *
 * The id is carried straight through, so whatever comes back names a real row
 * in `services`. It must be saved to enquiries.service_id and never to
 * size_band_id, which has a foreign key to price_bands and will refuse it.
 */
export function bandFromService(
  service: Service,
  /** This person's own price, where they have set one. */
  mine?: Pick<ServicePerson, "minutes" | "price_pence"> | null,
): PriceBand {
  const p = resolvePrice(service, mine);

  /*
   * Hours are derived but never used to price: quoteForBand returns the flat
   * price whenever price_low_pence is set, and a service always has one or is
   * filtered out before it gets here. They are carried because the type wants
   * them, and they are kept honest anyway so that anything reading them for a
   * rough length is not misled.
   */
  const hours = (p.minutes ?? 0) / 60;

  return {
    id: service.id,
    studio_id: service.studio_id,
    size_label: service.name,
    hours_low: hours,
    hours_high: hours,
    sort_order: service.sort_order,
    requires_consultation: service.requires_consultation,
    price_low_pence: p.price_pence,
    price_high_pence: p.price_to_pence ?? p.price_pence,
    duration_minutes: p.minutes,
  };
}

/**
 * Everything the assistant may offer, priced for whoever it is quoting for.
 *
 * Three things are left out, and each of them would be a distinct way of
 * embarrassing a business:
 *
 *  - a product, which takes no time and cannot be an appointment;
 *  - anything marked not-offered-online, which is on the list for the diary
 *    and is not to be suggested to a stranger who has not named it;
 *  - anything with no price, because the assistant would otherwise have to
 *    quote a number it has not been given, and inventing one is the single
 *    worst thing it could do.
 *
 * Passing nobody gives the shop's own prices, which is what to quote before a
 * client has said who they want.
 */
export function bandsFromServices(
  services: Service[],
  mine?: Map<string, ServicePerson> | null,
  /**
   * Who is being quoted for, when the conversation belongs to one person.
   *
   * Null means nobody has been asked for yet, and then only the shop's own
   * list may be offered. Somebody asking a salon about a haircut must not be
   * read a nail technician's twenty gel colours — they are not the salon's
   * work and nobody but her does them.
   */
  forArtistId?: string | null,
): PriceBand[] {
  return services
    .filter((s) => s.kind === "service")
    .filter((s) => s.bookable_online)
    .filter((s) => s.active)
    .filter((s) => s.minutes != null)
    // The business's, or this person's own. Never somebody else's.
    .filter((s) => s.artist_id == null || s.artist_id === forArtistId)
    .map((s) => bandFromService(s, mine?.get(s.id)))
    .filter((b) => b.price_low_pence != null)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * How long to set aside for this client, for this service.
 *
 * The book's length, plus whatever is known about the person sitting in the
 * chair. Thick hair that always takes twenty minutes more; somebody who is
 * reliably quicker than the list says.
 *
 * Floored at five minutes rather than allowed to reach zero. A delta large
 * enough to cancel the appointment out is a typo somebody made months ago, and
 * the diary should not answer it with an appointment of no length.
 */
export function minutesForClient(
  base: number,
  delta: number | null | undefined,
  max: number,
): number {
  const wanted = base + (delta ?? 0);
  return Math.min(Math.max(wanted, 5), max);
}
