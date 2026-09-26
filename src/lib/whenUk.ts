/**
 * When something happened, in the time the business keeps.
 *
 * Giles, looking at the Living Canvas inbox: "make sure the time is uk time,
 * timestamp all messages."
 *
 * Both halves of that are real faults.
 *
 * ── The clock ───────────────────────────────────────────────────────────────
 *
 * These pages are rendered on a server in UTC. Any `toLocaleTimeString` that
 * does not name a zone formats in the zone of whatever machine is running —
 * which is London from October to March and an hour out from March to
 * October. A text that arrived at 09:22 showing as 08:22 is not a cosmetic
 * problem: it is the difference between "they wrote half an hour ago" and
 * "they wrote an hour and a half ago", which is the judgement somebody makes
 * before deciding whether it is too late to ring back.
 *
 * So every function here names Europe/London. It is not read from the machine,
 * it is not read from the browser, and it does not drift in summer.
 *
 * ── The stamp ───────────────────────────────────────────────────────────────
 *
 * The inbox said "2h ago" and nothing else. That is the right thing for
 * triage and useless for everything after it: it cannot be compared against a
 * phone log, or read back to somebody, or used to work out whether a reply
 * went before or after a call. And it silently stops being true the moment
 * the page has been open a while.
 *
 * A time is a fact. "Today 08:22" is both.
 *
 * Pure, and every function takes `now`, so the wording can be tested without
 * a clock and so a server render and the browser cannot disagree about what
 * day it is.
 */

const LONDON = "Europe/London";

/** "08:22". Twenty-four hour, because a diary is. */
export function ukTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "26 Sep". The year only where it is not this one — see ukStamp. */
export function ukDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
  });
}

/** "26 Sep 2025", for anything old enough that the year matters. */
export function ukDayYear(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Which London day something falls on, as "2026-09-26".
 *
 * Worked out through the formatter rather than by subtracting hours, because
 * the only correct answer on the two days a year the clocks change is the one
 * the zone database gives.
 */
export function londonDay(iso: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}

/**
 * The whole thing, short enough for a row in a list.
 *
 * "Today 08:22" · "Yesterday 17:40" · "24 Sep 11:15" · "26 Sep 2025 09:00"
 *
 * Today and yesterday are named rather than dated because that is how
 * somebody scanning an inbox thinks — and because a bare "26 Sep" next to
 * three other 26 Seps tells them nothing at all.
 */
export function ukStamp(iso: string | Date, now: Date = new Date()): string {
  const day = londonDay(iso);
  const today = londonDay(now);
  const yesterday = londonDay(new Date(now.getTime() - 86_400_000));
  const time = ukTime(iso);

  if (day === today) return `Today ${time}`;
  if (day === yesterday) return `Yesterday ${time}`;

  /* The year only once it is a different one. Most of an inbox is this year. */
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return `${sameYear ? ukDay(iso) : ukDayYear(iso)} ${time}`;
}

/**
 * How long ago, for the cases where that is the more useful half.
 *
 * Kept because it answers a different question from the stamp: one says when,
 * the other says how long you have left it. The inbox shows both.
 */
export function ukAgo(iso: string | Date, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
