import { test } from "node:test";
import assert from "node:assert/strict";
import { busyFromIcalText } from "./ical.ts";

const window = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-30T00:00:00Z") };

function ics(summary: string): string {
  return [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART:20260914T090000Z",
    "DTEND:20260914T100000Z",
    `SUMMARY:${summary}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

test("the name of an entry comes through", () => {
  const [busy] = busyFromIcalText(ics("Dentist"), window.from, window.to);
  assert.equal(busy.title, "Dentist");
});

/*
 * iCalendar escapes commas, semicolons and newlines inside a text value. Left
 * as they arrive, a perfectly ordinary calendar entry is shown with backslashes
 * through it.
 */
test("escaped punctuation is unescaped", () => {
  const [busy] = busyFromIcalText(ics(String.raw`Dentist\, 2pm\; bring card`), window.from, window.to);
  assert.equal(busy.title, "Dentist, 2pm; bring card");
});

test("a wrapped entry becomes one line", () => {
  const [busy] = busyFromIcalText(ics(String.raw`School run\nthen shopping`), window.from, window.to);
  assert.equal(busy.title, "School run then shopping");
});

/* A feed that names nothing is normal, and must not produce an empty string. */
test("no name at all stays undefined rather than blank", () => {
  const bare = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART:20260914T090000Z",
    "DTEND:20260914T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const [busy] = busyFromIcalText(bare, window.from, window.to);
  assert.equal(busy.title, undefined);
});

/* Availability is unaffected: an hour is taken whatever it is called. */
test("the hours are still the hours", () => {
  const [busy] = busyFromIcalText(ics("Dentist"), window.from, window.to);
  assert.equal(busy.starts_at, "2026-09-14T09:00:00.000Z");
  assert.equal(busy.ends_at, "2026-09-14T10:00:00.000Z");
});
