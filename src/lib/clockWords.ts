/**
 * "17:00" as a person would say it.
 *
 * The prompt lists opening hours in 24-hour time, which is unambiguous and
 * correct, and then asks the model to say them out loud. Converting is
 * arithmetic, and the model gets it wrong often enough to matter:
 *
 *   Willow & Co, open 09:00 to 17:00 on a Saturday, 15 October:
 *     "We're open Saturdays 9 to 3."
 *
 * Kerbside, the same hours, got it right in the same minute. Cogs, on
 * 08:30 to 12:30, got it right. So it is not a data fault and not a trade
 * fault, it is a conversion the model does in its head and sometimes drops,
 * and it sends somebody to a showroom that shut two hours ago.
 *
 * This is the same answer as quote_estimate: do not ask the model to work
 * anything out. The prompt now carries both forms, so saying the hours is
 * copying rather than converting.
 */

/** Minutes past midnight, or null for anything that is not a time. */
function minutesIn(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h > 23 || mins > 59) return null;
  return h * 60 + mins;
}

/**
 * @param hhmm a 24-hour time, "09:00" or "17:30"
 * @returns how somebody says it, or the input unchanged if it is not a time
 */
export function clockWords(hhmm: string): string {
  const total = minutesIn(hhmm);
  if (total == null) return hhmm;

  const h24 = Math.floor(total / 60);
  const mins = total % 60;

  /*
   * Midnight and midday said as themselves.
   *
   * "12am" and "12pm" are the two everybody has to stop and think about, and
   * a business is far more likely to mean noon than to mean nothing.
   */
  if (total === 0) return "midnight";
  if (total === 12 * 60) return "midday";

  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  return mins === 0 ? `${h12}${suffix}` : `${h12}:${String(mins).padStart(2, "0")}${suffix}`;
}

/** "09:00 to 17:00 (9am to 5pm)", for a prompt that must not be converted. */
export function bothWays(open: string, close: string): string {
  const said = `${clockWords(open)} to ${clockWords(close)}`;
  const written = `${open} to ${close}`;
  /* No point saying it twice when they are the same shape. */
  return written === said ? written : `${written} (${said})`;
}
