import { localParts, instantFrom } from "./tz.ts";
import { repeatDates, type RepeatRule } from "../calendar.ts";

/** The rules a customer can ask the assistant for. */
export const REGULAR_RULES = ["weekly", "fortnightly", "monthly"] as const;
export type RegularRule = (typeof REGULAR_RULES)[number];

/** How many visits a standing booking runs to at most, in one go. */
export const MOST_VISITS = 12;

export function isRegularRule(raw: unknown): raw is RegularRule {
  return typeof raw === "string" && (REGULAR_RULES as readonly string[]).includes(raw);
}

/** Two is a pattern; twelve is far enough ahead for anybody to plan. */
export function howManyVisits(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 6;
  return Math.min(MOST_VISITS, Math.max(2, n));
}

/**
 * The instants a standing appointment falls on, the first one included.
 *
 * Worked out as wall-clock time in the business's own timezone rather than by
 * adding seven days to an instant. A Tuesday five o'clock lesson booked in
 * October is still at five o'clock in November: adding 604,800,000 milliseconds
 * would have made it four, and a pupil standing outside a locked car in the
 * dark is exactly the kind of thing nobody would notice for a week.
 */
export function regularInstants(
  firstIso: string,
  rule: RegularRule,
  visits: number,
  timezone: string,
): string[] {
  const first = new Date(firstIso);
  if (!Number.isFinite(first.getTime())) return [];

  const here = localParts(first, timezone);
  const hhmm = timeIn(first, timezone);
  const wanted = howManyVisits(visits);

  /*
   * Generated on a plain local date — repeatDates is the same code the diary
   * uses for a repeating job, so "the 31st" means the same thing to a customer
   * texting in as it does to the owner typing it in.
   */
  const days = repeatDates(
    new Date(here.year, here.month - 1, here.day),
    rule as RepeatRule,
    null,
  ).slice(0, wanted);

  const out: string[] = [];
  for (const day of days) {
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
      day.getDate(),
    ).padStart(2, "0")}`;
    const at = instantFrom(iso, hhmm, timezone);
    if (at) out.push(at.toISOString());
  }
  return out;
}

/** The wall-clock time of an instant where the business is, as "HH:MM". */
export function timeIn(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  // Midnight comes back as "24" from some runtimes.
  const hour = at.hour === "24" ? "00" : at.hour;
  return `${hour}:${at.minute}`;
}

/**
 * What to tell the customer once the series is in.
 *
 * A clash is normal and is not a failure: the business may be shut on the
 * Monday after next, or that slot may already have gone. Saying which dates
 * could not be done is the difference between a customer who knows where they
 * stand and one who turns up to a locked door.
 */
export function regularSummary(args: {
  rule: RegularRule;
  made: string[];
  skipped: string[];
  timezone: string;
}): string {
  const { rule, made, skipped } = args;
  const every =
    rule === "weekly" ? "every week" : rule === "fortnightly" ? "every two weeks" : "every month";

  if (made.length <= 1) {
    return `Only the first one could be booked ${every} — the rest were already taken or the business is shut then. Confirm the one appointment and say you will sort the rest out with them.`;
  }

  const lines = [`Booked ${made.length} visits, ${every}, starting with the first.`];
  if (skipped.length > 0) {
    lines.push(
      `${skipped.length} of the dates could not be done (already booked, or shut) — tell them which ones are missing and offer to find another time for those.`,
    );
  }
  lines.push("Read the dates back to them.");
  return lines.join(" ");
}
