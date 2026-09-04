import { test } from "node:test";
import assert from "node:assert/strict";
import { statusFor } from "./widgetStatus.ts";
import type { OpeningHours } from "./types.ts";

/** Tue–Sat 9–5, shut Sunday and Monday. A very ordinary salon. */
const salon: OpeningHours[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  open: "09:00",
  close: "17:00",
  closed: day === 0 || day === 1,
}));

// 2026-03-05 is a Thursday. March is GMT in London, so UTC reads as local.
const on = (iso: string) => new Date(iso);
const LDN = "Europe/London";

test("open, during opening hours", () => {
  assert.deepEqual(statusFor(salon, LDN, on("2026-03-05T11:00:00Z")), {
    open: true,
    line: "Answering now",
  });
});

test("before opening, it says when it is back", () => {
  const s = statusFor(salon, LDN, on("2026-03-05T07:30:00Z"));
  assert.equal(s.open, false);
  assert.equal(s.line, "Back at 9am — ask now");
});

test("after closing, it names the next day it is open", () => {
  const s = statusFor(salon, LDN, on("2026-03-05T22:10:00Z"));
  assert.equal(s.open, false);
  assert.equal(s.line, "Closed — open tomorrow");
});

test("it looks past a run of closed days", () => {
  // Saturday night: shut Sunday and Monday, so the answer is Tuesday.
  const s = statusFor(salon, LDN, on("2026-03-07T20:00:00Z"));
  assert.equal(s.line, "Closed — open Tuesday");
});

test("on a closed day it still looks forward", () => {
  // Sunday afternoon.
  const s = statusFor(salon, LDN, on("2026-03-08T14:00:00Z"));
  assert.equal(s.open, false);
  assert.equal(s.line, "Closed — open Tuesday");
});

// -------------------------------------------------- it has to be true

test("the minute it closes it stops saying it is answering", () => {
  assert.equal(statusFor(salon, LDN, on("2026-03-05T16:59:00Z")).open, true);
  assert.equal(statusFor(salon, LDN, on("2026-03-05T17:00:00Z")).open, false);
});

test("a business with no hours set is never told it is closed", () => {
  /*
   * The one somebody sees on the day they are setting up. Telling their
   * visitors the business is shut would be untrue and the worst possible
   * first impression.
   */
  for (const none of [undefined, null, []]) {
    const s = statusFor(none as OpeningHours[], LDN, on("2026-03-05T11:00:00Z"));
    assert.equal(s.open, false);
    assert.equal(s.line, "Ask us anything");
  }
});

test("hours that do not parse do not claim anything", () => {
  const broken = salon.map((h) => ({ ...h, open: "", close: "" }));
  assert.equal(statusFor(broken, LDN, on("2026-03-05T11:00:00Z")).open, false);
});

test("every day closed says something rather than nothing", () => {
  const shut = salon.map((h) => ({ ...h, closed: true }));
  assert.equal(statusFor(shut, LDN, on("2026-03-05T11:00:00Z")).line, "Ask us anything");
});

// ------------------------------------------------------------ timezones

test("it is judged where the business is, not where the visitor is", () => {
  /*
   * Half nine at night in London is half four in the afternoon in New York.
   * A visitor in London looking at a New York salon must be told it is open,
   * because it is — for the people who work there.
   */
  const evening = on("2026-03-05T21:30:00Z");
  assert.equal(statusFor(salon, LDN, evening).open, false);
  assert.equal(statusFor(salon, "America/New_York", evening).open, true);
});

test("half past hours are said the way people say them", () => {
  const half = salon.map((h) => ({ ...h, open: "09:30" }));
  assert.equal(statusFor(half, LDN, on("2026-03-05T07:00:00Z")).line, "Back at 9.30am — ask now");
});
