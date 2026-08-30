import type { BusyPeriod } from "./provider";

/**
 * Minimal iCalendar reader — busy periods only.
 *
 * Fresha, Booksy, Treatwell and Square all publish a subscription URL for the
 * diary. Fresha's deliberately strips client names and services and exports
 * only start and end times, which is all we need and means no customer personal
 * data ever reaches us.
 *
 * Deliberately not a full RFC 5545 implementation. It reads VEVENT start and
 * end times and expands simple weekly and daily recurrences, which is what
 * these exports contain. Anything it cannot parse is skipped rather than
 * guessed at — a missed busy period would mean offering a slot that is taken.
 */

const MAX_RECURRENCE_EXPANSIONS = 400;

/** Unfolds the RFC 5545 line continuations (a leading space or tab). */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter(Boolean);
}

/** Parses DTSTART/DTEND values: 20260830T140000Z, 20260830T140000, or 20260830. */
function parseDate(value: string, params: string): Date | null {
  const raw = value.trim();

  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
  if (utc) {
    const [, y, mo, d, h, mi, s] = utc;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }

  const local = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (local) {
    const [, y, mo, d, h, mi, s] = local;
    // No timezone conversion: these feeds are published in the business's own
    // zone, and treating the wall-clock time as UTC would shift every booking.
    // Callers compare against times built the same way.
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly && params.includes("VALUE=DATE")) {
    const [, y, mo, d] = dateOnly;
    return new Date(Date.UTC(+y, +mo - 1, +d));
  }

  return null;
}

type RawEvent = { start: Date; end: Date; rrule?: string };

function parseEvents(ics: string): RawEvent[] {
  const lines = unfold(ics);
  const events: RawEvent[] = [];

  let inEvent = false;
  let start: Date | null = null;
  let end: Date | null = null;
  let rrule: string | undefined;
  let status: string | undefined;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      start = end = null;
      rrule = status = undefined;
      continue;
    }

    if (line.startsWith("END:VEVENT")) {
      // A cancelled appointment is not a busy period.
      if (inEvent && start && end && status !== "CANCELLED") {
        events.push({ start, end, rrule });
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const name = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [key, ...params] = name.split(";");

    if (key === "DTSTART") start = parseDate(value, params.join(";"));
    else if (key === "DTEND") end = parseDate(value, params.join(";"));
    else if (key === "RRULE") rrule = value;
    else if (key === "STATUS") status = value.trim().toUpperCase();
  }

  return events;
}

/** Expands DAILY and WEEKLY rules. Anything else is treated as a one-off. */
function expand(event: RawEvent, from: Date, to: Date): BusyPeriod[] {
  const duration = event.end.getTime() - event.start.getTime();
  const occurrences: BusyPeriod[] = [];

  const add = (startsAt: Date) => {
    const endsAt = new Date(startsAt.getTime() + duration);
    if (endsAt > from && startsAt < to) {
      occurrences.push({
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      });
    }
  };

  if (!event.rrule) {
    add(event.start);
    return occurrences;
  }

  const rule = Object.fromEntries(
    event.rrule.split(";").map((part) => {
      const [k, v] = part.split("=");
      return [k.toUpperCase(), v];
    }),
  );

  const freq = rule.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY") {
    add(event.start);
    return occurrences;
  }

  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const stepDays = freq === "DAILY" ? interval : interval * 7;
  const until = rule.UNTIL ? parseDate(rule.UNTIL, "") : null;
  const count = rule.COUNT ? Number(rule.COUNT) : null;

  let cursor = new Date(event.start);
  for (let i = 0; i < MAX_RECURRENCE_EXPANSIONS; i++) {
    if (cursor >= to) break;
    if (until && cursor > until) break;
    if (count != null && i >= count) break;
    add(cursor);
    cursor = new Date(cursor.getTime() + stepDays * 86400000);
  }

  return occurrences;
}

/** Fetches a subscription URL and returns busy periods overlapping the window. */
export async function busyFromIcal(
  url: string,
  from: Date,
  to: Date,
): Promise<BusyPeriod[]> {
  // webcal:// is the same document over https.
  const httpUrl = url.replace(/^webcal:\/\//i, "https://");

  const response = await fetch(httpUrl, {
    headers: { Accept: "text/calendar, text/plain" },
    // The feed lags its source by up to 15 minutes anyway; a short cache keeps
    // a busy conversation from refetching it on every turn.
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Calendar feed returned ${response.status}`);
  }

  const body = await response.text();
  if (!body.includes("BEGIN:VCALENDAR")) {
    throw new Error("That URL did not return a calendar feed.");
  }

  return parseEvents(body)
    .flatMap((event) => expand(event, from, to))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
