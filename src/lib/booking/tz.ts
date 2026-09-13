/**
 * Timezone arithmetic without a date library.
 *
 * Opening hours are wall-clock times in the business's own timezone ("we open
 * at ten"). Diaries and the database speak UTC. The server runs in UTC on
 * Vercel and in local time on a laptop, so anything using the host's timezone
 * is wrong somewhere — and in Britain, wrong for the seven months of BST.
 */

/** Milliseconds to add to UTC to get wall-clock time in `timeZone` at `instant`. */
export function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;

  const asIfUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    // Intl gives 24 for midnight under hour12: false.
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  );

  return asIfUtc - instant.getTime();
}

/** The calendar date and weekday in `timeZone` for a given instant. */
export function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const at = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    year: Number(at.year),
    month: Number(at.month),
    day: Number(at.day),
    weekday: weekdays.indexOf(at.weekday), // 0 = Sunday, matching OpeningHours
  };
}

/**
 * The UTC instant for a wall-clock time in `timeZone`.
 *
 * Applying the offset shifts the instant, which can cross a DST boundary, so
 * the offset is resolved a second time at the corrected instant.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  minutesIntoDay: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minutesIntoDay);
  const firstPass = new Date(naive - offsetAt(new Date(naive), timeZone));
  return new Date(naive - offsetAt(firstPass, timeZone));
}

/**
 * Turns the date and time from a form into an instant.
 *
 * Somebody types wall-clock time in their own timezone. Treating it as the
 * server's would put every entry an hour out through British Summer Time — the
 * same trap the assistant's slot finder had.
 *
 * Here rather than beside the diary's own action, because a second screen now
 * needs it and a copy of a timezone conversion is a copy that will be half
 * fixed one day.
 */
export function instantFrom(date: string, time: string, timezone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  return zonedToUtc(+d[1], +d[2], +d[3], +t[1] * 60 + +t[2], timezone);
}
