import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar } from "./ics.ts";

/**
 * The calendar file we hand out.
 *
 * Two things depend on it: the feed a business subscribes to so its diary
 * appears in Google or Apple alongside the rest of its life, and the
 * attachment on a booking confirmation so a client never has to look the
 * appointment up.
 *
 * Both fail the same way when it is malformed — silently. A calendar app does
 * not report a parse error; the entry simply never appears, and nobody finds
 * out until somebody misses an appointment.
 */

const at = (iso: string) => new Date(iso);

const one = (over: Partial<Parameters<typeof buildCalendar>[0]["events"][0]> = {}) =>
  buildCalendar({
    name: "The Fold Hair",
    events: [
      {
        uid: "booking-1@second-pair.com",
        starts: at("2026-09-02T14:00:00Z"),
        ends: at("2026-09-02T15:00:00Z"),
        summary: "Cut and finish",
        ...over,
      },
    ],
  });

const lines = (ics: string) => ics.split("\r\n");

// ------------------------------------------------------------- the envelope

test("it is a calendar a parser will recognise", () => {
  const out = one();
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.match(out, /VERSION:2\.0/);
  assert.ok(out.trimEnd().endsWith("END:VCALENDAR"));
});

test("every line ends CRLF, as the spec requires", () => {
  const out = one();
  // A lone \n anywhere is a malformed file. Strip the CRLFs and look for what
  // is left.
  assert.doesNotMatch(out.replace(/\r\n/g, ""), /\n/);
});

test("an event is opened and closed", () => {
  const out = one();
  assert.equal((out.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.equal((out.match(/END:VEVENT/g) ?? []).length, 1);
});

test("times are UTC, so no calendar has to guess a zone", () => {
  const out = one();
  assert.match(out, /DTSTART:20260902T140000Z/);
  assert.match(out, /DTEND:20260902T150000Z/);
});

test("the uid comes through, so refreshing updates rather than duplicates", () => {
  assert.match(one(), /UID:booking-1@second-pair\.com/);
});

// -------------------------------------------------------------- escaping

test("a comma in a name does not end the field early", () => {
  // Unescaped, "Cut, colour" would read as two values and the entry would be
  // wrong or rejected outright.
  const out = one({ summary: "Cut, colour and finish" });
  assert.match(out, /SUMMARY:Cut\\, colour and finish/);
});

test("a semicolon is escaped", () => {
  assert.match(one({ summary: "Cut; colour" }), /SUMMARY:Cut\\; colour/);
});

test("a backslash is escaped before anything else", () => {
  // Escaping in the wrong order turns one backslash into a broken escape.
  const out = one({ summary: "Before\\After" });
  assert.match(out, /SUMMARY:Before\\\\After/);
});

test("a newline in a note becomes the literal escape, not a real break", () => {
  const out = one({ summary: "Cut", description: "Line one\nLine two" });
  assert.match(out, /DESCRIPTION:Line one\\nLine two/);
  // And it must not have introduced a real line break mid-field.
  const description = lines(out).find((l) => l.startsWith("DESCRIPTION:"));
  assert.ok(description && !description.includes("\n"));
});

// --------------------------------------------------------------- folding

test("a long line is folded, and every piece stays within 75 octets", () => {
  const out = one({ summary: "A very long appointment title ".repeat(6) });
  for (const line of lines(out)) {
    assert.ok(
      Buffer.from(line, "utf8").length <= 75,
      `line over 75 octets: ${Buffer.from(line, "utf8").length}`,
    );
  }
});

test("a continuation begins with a single space", () => {
  const out = one({ summary: "x".repeat(200) });
  const wrapped = lines(out).filter((l) => l.startsWith(" "));
  assert.ok(wrapped.length > 0, "nothing was folded");
  for (const line of wrapped) assert.ok(!line.startsWith("  "), "double space");
});

test("folding counts octets, not characters", () => {
  // Seventy accented characters are 140 bytes: under the character limit and
  // well over the octet one. A file that breaks the limit is one some parsers
  // refuse.
  const out = one({ summary: "é".repeat(70) });
  for (const line of lines(out)) {
    assert.ok(Buffer.from(line, "utf8").length <= 75);
  }
});

test("folding never splits a character in half", () => {
  // A byte-wise split mid-character produces mojibake, or a parser error.
  const summary = "Émilie Ø Ångström ".repeat(8);
  const out = one({ summary });
  const unfolded = out.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("Émilie Ø Ångström"), "a character was cut in half");
  assert.doesNotMatch(unfolded, /�/, "replacement characters appeared");
});

test("what was folded reads back as what went in", () => {
  const summary = "Balayage, full head, with a very long note attached to it indeed";
  const out = one({ summary });
  const unfolded = out.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("SUMMARY:Balayage\\, full head"), unfolded.slice(0, 200));
});

// ------------------------------------------------------------ several, and none

test("an empty diary is still a valid calendar", () => {
  const out = buildCalendar({ name: "The Fold Hair", events: [] });
  assert.match(out, /BEGIN:VCALENDAR/);
  assert.ok(out.trimEnd().endsWith("END:VCALENDAR"));
  assert.doesNotMatch(out, /BEGIN:VEVENT/);
});

test("several events each get their own block", () => {
  const out = buildCalendar({
    name: "The Fold Hair",
    events: [
      { uid: "a", starts: at("2026-09-02T09:00:00Z"), ends: at("2026-09-02T10:00:00Z"), summary: "One" },
      { uid: "b", starts: at("2026-09-03T09:00:00Z"), ends: at("2026-09-03T10:00:00Z"), summary: "Two" },
    ],
  });
  assert.equal((out.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.equal((out.match(/END:VEVENT/g) ?? []).length, 2);
});

test("the calendar carries the business's name", () => {
  assert.match(one(), /The Fold Hair/);
});

test("a cancelled entry says so rather than vanishing", () => {
  // Removing it from the feed leaves it in the subscriber's calendar forever;
  // marking it cancelled is what actually clears it.
  const out = one({ cancelled: true });
  assert.match(out, /STATUS:CANCELLED/);
});
