/**
 * Writing an iCalendar feed.
 *
 * RFC 5545 is unforgiving and the failure mode is silence: Apple Calendar will
 * subscribe happily to a malformed feed and simply show nothing, with no error
 * anywhere. So the fussy parts are done properly rather than approximately —
 * CRLF line endings, 75-octet folding, escaped text, and UTC timestamps.
 *
 * Everything is written in UTC (the Z suffix) rather than with a VTIMEZONE
 * block. A booking is an instant, the subscriber's calendar knows its own
 * timezone, and hand-rolling VTIMEZONE definitions is a well-known way to be
 * an hour out twice a year.
 */

export type CalendarEvent = {
  /** Stable across regenerations, or every refresh duplicates everything. */
  uid: string;
  starts: Date;
  ends: Date;
  summary: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  /** When it last changed, so a calendar knows which version wins. */
  updated?: Date;
  cancelled?: boolean;
};

/** Escapes the four characters iCalendar treats as special in a text value. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a line to 75 octets, continuing with a leading space.
 *
 * Counted in octets rather than characters: a line of emoji or accented names
 * can be well under 75 characters and still over the limit, and a feed that
 * breaks the limit is one some parsers reject.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let cursor = 0;
  let limit = 75;

  while (cursor < bytes.length) {
    let end = Math.min(cursor + limit, bytes.length);

    // Never split a multi-byte character: continuation bytes are 10xxxxxx.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;

    parts.push(bytes.subarray(cursor, end).toString("utf8"));
    cursor = end;
    limit = 74; // subsequent lines lose one octet to the leading space
  }

  return parts.join("\r\n ");
}

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Just the date, for all-day entries. */
const dateOnly = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, "");

export function buildCalendar({
  name,
  description,
  events,
}: {
  name: string;
  description?: string;
  events: CalendarEvent[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Second Pair//Diary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Non-standard, but every major client reads one of these for the name.
    `X-WR-CALNAME:${escapeText(name)}`,
    `NAME:${escapeText(name)}`,
    // How often to poll. A hint only — Google in particular ignores it.
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  if (description) {
    lines.push(`X-WR-CALDESC:${escapeText(description)}`);
    lines.push(`DESCRIPTION:${escapeText(description)}`);
  }

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${stamp(event.updated ?? new Date(0))}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(event.starts)}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnly(event.ends)}`);
    } else {
      lines.push(`DTSTART:${stamp(event.starts)}`);
      lines.push(`DTEND:${stamp(event.ends)}`);
    }

    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push(`STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // CRLF throughout, and a trailing one. Both are required, and both are the
  // usual reason a hand-written feed is rejected.
  return lines.map(fold).join("\r\n") + "\r\n";
}
