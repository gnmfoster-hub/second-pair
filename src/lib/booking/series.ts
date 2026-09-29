import { describeSlot } from "./slots.ts";

/**
 * How to describe a run of visits in one sentence.
 *
 * Giles, 29 Sep: "if a booking is made with multiple repeated days summarise
 * this in the confirmation, don't send one for each day."
 *
 * He is right, and the first half of that is the half with the consequence. Six
 * cat visits booked in one press wrote six confirmations, so a customer who
 * booked once got told six times that they were booked in — which does not read
 * as thoroughness, it reads as six appointments, and the sixth one arrives while
 * they are working out whether to ring and complain.
 *
 * The fix is two parts: only the first of a set gets a confirmation at all (see
 * the diary's add action), and that one has to describe the whole set rather
 * than its own first day. This is that second part.
 *
 * ── Why it is a count and a span rather than a list ─────────────────────────
 *
 * Because it goes in a text as well as an email. A text is 160 characters, and
 * "Monday 3 November at 9:00 am, Tuesday 4 November at 9:00 am, Wednesday..."
 * is four texts before the sentence around it. So the body gets the shape of
 * the thing — how many, from when to when — and the email carries every date in
 * full underneath, where it costs nothing.
 *
 * Two is listed rather than summarised, because "2 visits between Monday and
 * Tuesday" is more words than saying both and tells somebody less.
 */
export function describeSeries(
  startsAt: string[],
  timezone: string,
  /** What the business calls one of these. "visit" for pet care, "appointment" elsewhere. */
  noun = "visit",
): string {
  const real = startsAt
    .filter((s) => Number.isFinite(Date.parse(s)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));

  if (real.length === 0) return "";

  const say = (iso: string) => describeSlot({ starts_at: iso, ends_at: iso }, timezone);

  if (real.length === 1) return say(real[0]);
  if (real.length === 2) return `${say(real[0])} and ${say(real[1])}`;

  /*
   * The day without the time, for the two ends of the span.
   *
   * Deliberately not describeSlot: "6 visits between Monday 3 November at 9:00
   * am and Saturday 8 November at 9:00 am" buries the two numbers that matter
   * under two times that are usually the same. The times are in the email's own
   * list, one per line, where somebody checking a particular day will look.
   */
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: timezone,
    }).format(new Date(iso));

  return `${real.length} ${noun}s, ${day(real[0])} to ${day(real[real.length - 1])}`;
}

/**
 * Every date in the set, one per line, for the email.
 *
 * The email has room and costs nothing per character, so it carries what the
 * text cannot: the actual day and time of each visit. That is the list somebody
 * checks in a fortnight when they cannot remember whether the Thursday was
 * included.
 */
export function listSeries(startsAt: string[], timezone: string): string[] {
  return startsAt
    .filter((s) => Number.isFinite(Date.parse(s)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .map((s) => describeSlot({ starts_at: s, ends_at: s }, timezone));
}
