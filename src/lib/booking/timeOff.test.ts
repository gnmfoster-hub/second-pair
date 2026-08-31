import { test } from "node:test";
import assert from "node:assert/strict";
import { timeOffAsBusy } from "./timeOff.ts";
import { findSlots } from "./slots.ts";

const LUNCH = [{ label: "Lunch", days: [1, 2, 3, 4, 5], from: "13:00", to: "14:00" }];

const localHour = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

test("a weekday lunch turns up once a day, at one o'clock", () => {
  // Monday to Friday of a single week.
  const busy = timeOffAsBusy(
    LUNCH,
    new Date("2026-09-07T00:00:00Z"),
    new Date("2026-09-11T23:59:00Z"),
    "Europe/London",
  );

  const within = busy.filter(
    (b) =>
      b.starts_at >= "2026-09-07T00:00:00.000Z" && b.starts_at <= "2026-09-11T23:59:00.000Z",
  );

  assert.equal(within.length, 5, `${within.length} lunches`);
  for (const period of within) {
    assert.equal(localHour(period.starts_at), "13:00");
    assert.equal(localHour(period.ends_at), "14:00");
  }
});

test("one o'clock means one o'clock in summer and in winter", () => {
  // British Summer Time: the UK is an hour ahead of UTC.
  const summer = timeOffAsBusy(
    LUNCH,
    new Date("2026-07-06T00:00:00Z"),
    new Date("2026-07-06T23:00:00Z"),
    "Europe/London",
  ).find((b) => b.starts_at.startsWith("2026-07-06"));

  // Greenwich Mean Time: the UK is on UTC.
  const winter = timeOffAsBusy(
    LUNCH,
    new Date("2026-01-05T00:00:00Z"),
    new Date("2026-01-05T23:00:00Z"),
    "Europe/London",
  ).find((b) => b.starts_at.startsWith("2026-01-05"));

  assert.equal(localHour(summer!.starts_at), "13:00");
  assert.equal(localHour(winter!.starts_at), "13:00");

  // Which is a different instant in each — the whole point of doing it this way.
  assert.equal(summer!.starts_at.slice(11, 16), "12:00");
  assert.equal(winter!.starts_at.slice(11, 16), "13:00");
});

test("a day nobody is off gets nothing", () => {
  const busy = timeOffAsBusy(
    [{ label: "Half day", days: [3], from: "12:00", to: "17:00" }],
    new Date("2026-09-07T00:00:00Z"),
    new Date("2026-09-08T23:59:00Z"),
    "Europe/London",
  );
  // Monday and Tuesday only; the Wednesday entry falls outside.
  assert.equal(
    busy.filter((b) => b.starts_at.startsWith("2026-09-07")).length,
    0,
  );
});

test("a backwards entry is ignored rather than blocking the day", () => {
  const busy = timeOffAsBusy(
    [{ label: "Typo", days: [1], from: "15:00", to: "09:00" }],
    new Date("2026-09-07T00:00:00Z"),
    new Date("2026-09-07T23:59:00Z"),
    "Europe/London",
  );
  assert.equal(busy.length, 0);
});

test("the slot finder will not offer a time somebody is off", () => {
  const open = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: "09:00",
    close: "17:00",
    closed: day === 0 || day === 6,
  }));

  const busy = timeOffAsBusy(
    LUNCH,
    new Date("2026-09-07T00:00:00Z"),
    new Date("2026-09-12T00:00:00Z"),
    "Europe/London",
  );

  const slots = findSlots({
    hours: open,
    busy,
    durationMinutes: 60,
    timezone: "Europe/London",
    noticeHours: 0,
    limit: 60,
    now: new Date("2026-09-07T07:00:00Z"),
  });

  const atOne = slots.filter((s) => localHour(s.starts_at) === "13:00");
  assert.equal(atOne.length, 0, `${atOne.length} slots offered during lunch`);

  // And the rest of the day is still bookable, so it blocks an hour not a day.
  assert.ok(slots.some((s) => localHour(s.starts_at) === "14:00"));
});
