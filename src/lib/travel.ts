/**
 * Working away from the premises.
 *
 * Two things a business that travels needs, and neither requires a maps API:
 * padding between jobs so two cannot be booked back to back across town, and a
 * way to say which areas they actually cover.
 *
 * Real drive-time routing is better and costs money per request. This is what
 * a one-person business needs on day one, and the shape does not change when
 * routing replaces it.
 */

import type { BusyPeriod } from "./booking/provider";

/** The outward half of a UK postcode: SW1A 1AA -> SW1A. */
export function outwardCode(postcode: string): string {
  const trimmed = postcode.trim().toUpperCase();

  // A space is the reliable separator when someone writes it properly.
  const spaced = /^([A-Z0-9]{2,4})\s+[0-9][A-Z]{2}$/.exec(trimmed);
  if (spaced) return spaced[1];

  const cleaned = trimmed.replace(/[^A-Z0-9]/g, "");

  // A full postcode is 5 to 7 characters, and the last three are the inward
  // code. Anything shorter is already an outward code — people type "BS16"
  // when asked where they are, and stripping three off that gives "B", which
  // is a different city.
  return cleaned.length >= 5 ? cleaned.slice(0, cleaned.length - 3) : cleaned;
}

/** The letters at the start of an outward code: SW1A -> SW, M1 -> M. */
export function postcodeArea(postcode: string): string {
  return outwardCode(postcode).replace(/[0-9].*$/, "");
}

/**
 * Whether a postcode falls in an area the business covers.
 *
 * Matches on either the full outward code or just the area letters, so both
 * "BS" and "BS16" work as entries. No areas listed means no restriction.
 */
export function coversPostcode(areas: string[], postcode: string): boolean {
  if (!areas.length) return true;
  if (!postcode.trim()) return false;

  const outward = outwardCode(postcode);
  const area = postcodeArea(postcode);

  // Matched whole, never as a loose prefix: "B" must not swallow "BS16", or a
  // Birmingham electrician gets offered work in Bristol.
  return areas.some((entry) => {
    const wanted = entry.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!wanted) return false;
    return outward === wanted || area === wanted;
  });
}

/**
 * Pads busy periods so a job elsewhere leaves travelling time either side.
 *
 * Applied to what the slot finder treats as busy rather than to the bookings
 * themselves — the appointment is still an hour in the diary, it just cannot
 * have another one pressed up against it.
 */
export function withTravelTime(
  busy: BusyPeriod[],
  bufferMinutes: number,
): BusyPeriod[] {
  if (bufferMinutes <= 0) return busy;
  const padding = bufferMinutes * 60_000;

  return busy.map((period) => ({
    starts_at: new Date(Date.parse(period.starts_at) - padding).toISOString(),
    ends_at: new Date(Date.parse(period.ends_at) + padding).toISOString(),
  }));
}
