/**
 * The gaps in a day that could actually be sold.
 *
 * A diary is never full, and most of what is empty in it is not worth a
 * thought: ten minutes between a cut and a colour is how a day is supposed to
 * breathe. What matters is the hour and a half on Thursday afternoon that
 * nobody has asked for, because that is a real piece of somebody's week with
 * nothing in it — and once you know it is there, it is something to offer the
 * client who has not been back.
 *
 * Pure, and working in minutes from midnight rather than in dates, so the
 * whole of the awkward part — timezones, opening hours, which day it is — is
 * somebody else's problem and this can be tested with numbers.
 */

export type Span = { from: number; to: number };

/**
 * What is left of an open day once the work is taken out.
 *
 * Overlapping and out-of-order bookings are normal rather than exceptional —
 * a salon double-books a chair constantly and a week's rows arrive in whatever
 * order the database felt like — so they are merged rather than assumed away.
 * Anything shorter than `atLeast` is not a gap, it is the gap between two
 * appointments, and listing those would bury the ones that mean something.
 */
export function freeSlots(open: Span, busy: readonly Span[], atLeast: number): Span[] {
  if (open.to <= open.from || atLeast <= 0) return [];

  // Clipped to the open day first: an appointment that runs past closing does
  // not make the evening busy, and one before opening is not this day's.
  const inside = busy
    .map((b) => ({ from: Math.max(b.from, open.from), to: Math.min(b.to, open.to) }))
    .filter((b) => b.to > b.from)
    .sort((a, b) => a.from - b.from);

  const merged: Span[] = [];
  for (const span of inside) {
    const last = merged[merged.length - 1];
    // Touching counts as overlapping: an appointment ending at 2 and the next
    // starting at 2 leave no gap, and a zero-minute one is not worth a row.
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }

  const free: Span[] = [];
  let cursor = open.from;

  for (const span of merged) {
    if (span.from - cursor >= atLeast) free.push({ from: cursor, to: span.from });
    cursor = Math.max(cursor, span.to);
  }

  if (open.to - cursor >= atLeast) free.push({ from: cursor, to: open.to });

  return free;
}

/** "2:00 – 3:30pm", from minutes into the day. */
export function saidAsTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}
