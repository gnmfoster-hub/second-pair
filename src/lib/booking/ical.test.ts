import { test } from "node:test";
import assert from "node:assert/strict";
import { busyFromIcalText } from "./ical.ts";

/**
 * Reading a diary a business already keeps.
 *
 * A salon on Fresha keeps Fresha and subscribes us to its feed, which is most
 * of the answer to "we have already got a system". Everything downstream trusts
 * this: a busy period it fails to read becomes an hour the assistant offers to
 * somebody who cannot have it, and the client turns up to a chair that is taken.
 *
 * So the bias is deliberate — skip what cannot be understood, never guess.
 */

const WINDOW = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-30T00:00:00Z") };

const feed = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");

const event = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

const read = (body: string) => busyFromIcalText(body, WINDOW.from, WINDOW.to);

// --------------------------------------------------------------- the basics

test("a plain appointment becomes a busy period", () => {
  const busy = read(feed(event(["DTSTART:20260902T140000Z", "DTEND:20260902T150000Z"])));
  assert.equal(busy.length, 1);
  assert.equal(busy[0].starts_at, "2026-09-02T14:00:00.000Z");
  assert.equal(busy[0].ends_at, "2026-09-02T15:00:00.000Z");
});

test("several come back in order, whatever order they were written in", () => {
  const busy = read(
    feed(
      event(["DTSTART:20260905T090000Z", "DTEND:20260905T100000Z"]),
      event(["DTSTART:20260902T140000Z", "DTEND:20260902T150000Z"]),
    ),
  );
  assert.deepEqual(
    busy.map((b) => b.starts_at),
    ["2026-09-02T14:00:00.000Z", "2026-09-05T09:00:00.000Z"],
  );
});

test("it reads a feed with real CRLF line endings", () => {
  // Written the way a server actually sends it, not with plain newlines.
  const body = feed(event(["DTSTART:20260902T140000Z", "DTEND:20260902T150000Z"]));
  assert.ok(body.includes("\r\n"));
  assert.equal(read(body).length, 1);
});

test("a folded line is put back together", () => {
  // RFC 5545 wraps at 75 octets and continues with a leading space.
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTSTART:2026090",
    " 2T140000Z",
    "DTEND:20260902T150000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  assert.equal(read(body).length, 1, "a folded DTSTART was not rejoined");
});

// ------------------------------------------------------ what must be ignored

test("a cancelled appointment is not a busy period", () => {
  const busy = read(
    feed(event(["DTSTART:20260902T140000Z", "DTEND:20260902T150000Z", "STATUS:CANCELLED"])),
  );
  assert.deepEqual(busy, [], "a cancelled slot would be held forever");
});

test("an event with no end is skipped rather than guessed at", () => {
  assert.deepEqual(read(feed(event(["DTSTART:20260902T140000Z"]))), []);
});

test("an unreadable date is skipped rather than guessed at", () => {
  assert.deepEqual(
    read(feed(event(["DTSTART:not-a-date", "DTEND:also-not-a-date"]))),
    [],
  );
});

test("something that is not a calendar is refused outright", () => {
  assert.throws(() => read("<html>404 Not Found</html>"), /did not return a calendar/i);
});

test("an empty calendar is empty, not an error", () => {
  assert.deepEqual(read(feed()), []);
});

// --------------------------------------------------------------- the window

test("an appointment before the window is left out", () => {
  assert.deepEqual(read(feed(event(["DTSTART:20260801T140000Z", "DTEND:20260801T150000Z"]))), []);
});

test("an appointment after the window is left out", () => {
  assert.deepEqual(read(feed(event(["DTSTART:20261101T140000Z", "DTEND:20261101T150000Z"]))), []);
});

test("one that straddles the edge is kept", () => {
  // Starts before the window, ends inside it. Still an hour that is taken.
  const busy = read(feed(event(["DTSTART:20260831T230000Z", "DTEND:20260901T010000Z"])));
  assert.equal(busy.length, 1);
});

// ------------------------------------------------------------- repeating

test("a weekly rule repeats on the same weekday", () => {
  const busy = read(
    feed(event(["DTSTART:20260902T140000Z", "DTEND:20260902T150000Z", "RRULE:FREQ=WEEKLY"])),
  );
  assert.deepEqual(
    busy.map((b) => b.starts_at.slice(0, 10)),
    ["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23"],
  );
});

test("COUNT stops it", () => {
  const busy = read(
    feed(event(["DTSTART:20260902T140000Z", "DTEND:20260902T150000Z", "RRULE:FREQ=WEEKLY;COUNT=2"])),
  );
  assert.equal(busy.length, 2);
});

test("UNTIL stops it", () => {
  const busy = read(
    feed(
      event([
        "DTSTART:20260902T140000Z",
        "DTEND:20260902T150000Z",
        "RRULE:FREQ=WEEKLY;UNTIL=20260916T000000Z",
      ]),
    ),
  );
  assert.deepEqual(
    busy.map((b) => b.starts_at.slice(0, 10)),
    ["2026-09-02", "2026-09-09"],
  );
});

test("INTERVAL skips weeks", () => {
  const busy = read(
    feed(
      event([
        "DTSTART:20260902T140000Z",
        "DTEND:20260902T150000Z",
        "RRULE:FREQ=WEEKLY;INTERVAL=2",
      ]),
    ),
  );
  assert.deepEqual(
    busy.map((b) => b.starts_at.slice(0, 10)),
    ["2026-09-02", "2026-09-16"],
  );
});

test("a daily rule repeats every day", () => {
  const busy = read(
    feed(
      event([
        "DTSTART:20260902T140000Z",
        "DTEND:20260902T150000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
      ]),
    ),
  );
  assert.equal(busy.length, 3);
});

test("a rule it does not understand becomes a single appointment", () => {
  // Better one busy hour than none: a monthly rule read as a one-off still
  // blocks the occurrence we know about.
  const busy = read(
    feed(event(["DTSTART:20260902T140000Z", "DTEND:20260902T150000Z", "RRULE:FREQ=MONTHLY"])),
  );
  assert.equal(busy.length, 1);
});

test("a repeat cannot run away with itself", () => {
  // No UNTIL and no COUNT, over a wide window. There is a hard cap so a feed
  // cannot make us allocate forever.
  const busy = busyFromIcalText(
    feed(event(["DTSTART:20260101T140000Z", "DTEND:20260101T150000Z", "RRULE:FREQ=DAILY"])),
    new Date("2026-01-01T00:00:00Z"),
    new Date("2030-01-01T00:00:00Z"),
  );
  assert.ok(busy.length <= 400, `expanded ${busy.length} occurrences`);
  assert.ok(busy.length > 300, "expected it to fill the cap");
});

// -------------------------------------------------------------- all day

test("an all-day entry covers the day", () => {
  const busy = read(
    feed(event(["DTSTART;VALUE=DATE:20260903", "DTEND;VALUE=DATE:20260904"])),
  );
  assert.equal(busy.length, 1);
  assert.equal(busy[0].starts_at, "2026-09-03T00:00:00.000Z");
});

test("a floating time is taken at face value", () => {
  // These feeds publish in the business's own zone and callers compare against
  // times built the same way, so shifting them would move every booking.
  const busy = read(feed(event(["DTSTART:20260902T140000", "DTEND:20260902T150000"])));
  assert.equal(busy[0].starts_at, "2026-09-02T14:00:00.000Z");
});
