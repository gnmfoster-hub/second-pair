import type { PriceBand } from "../types.ts";

/**
 * How long a thing takes, said the way the business would say it.
 *
 * "roughly 0.75–0.75 hours" is what a 45-minute cut used to be described as,
 * because every band was rendered as a range of hours whether or not it was
 * priced by the hour. A flat-price service has a length, not a range, and
 * reading one back as a degenerate range invites the model to hedge about a
 * number that is not in doubt.
 *
 * Minutes up to an hour and a half, because "1.25 hours" is not how anybody
 * says an hour and a quarter to a customer.
 *
 * Its own module rather than a function in the prompt, so it can be tested:
 * prompt.ts imports through the @/ alias, which the test runner cannot follow.
 */
export function describeLength(band: PriceBand): string {
  const fixed = band.price_low_pence != null;

  if (fixed && band.duration_minutes != null) {
    const m = band.duration_minutes;
    if (m < 90) return `${m} minutes`;
    const hours = m / 60;
    return Number.isInteger(hours) ? `${hours} hours` : `about ${hours.toFixed(1)} hours`;
  }

  if (band.hours_low === band.hours_high) return `about ${band.hours_low} hours`;
  return `roughly ${band.hours_low}–${band.hours_high} hours`;
}
