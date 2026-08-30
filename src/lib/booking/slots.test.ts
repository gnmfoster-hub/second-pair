import { test } from "node:test";
import assert from "node:assert/strict";
import { findSlots, describeSlot } from "./slots.ts";
import { zonedToUtc, localParts } from "./tz.ts";
import type { OpeningHours } from "../types.ts";

// Monday 31 August 2026, 09:00 London (= 08:00Z, since Britain is on BST).
const NOW = new Date("2026-08-31T08:00:00Z");
const TZ = "Europe/London";

const HOURS: OpeningHours[] = [
  { day: 0, open: "10:00", close: "18:00", closed: true },
  { day: 1, open: "10:00", close: "18:00", closed: false },
  { day: 2, open: "10:00", close: "18:00", closed: false },
  { day: 3, open: "10:00", close: "18:00", closed: false },
  { day: 4, open: "10:00", close: "18:00", closed: false },
  { day: 5, open: "10:00", close: "18:00", closed: false },
  { day: 6, open: "10:00", close: "18:00", closed: true },
];

const base = {
  hours: HOURS,
  busy: [],
  durationMinutes: 60,
  timezone: TZ,
  now: NOW,
  noticeHours: 24,
};

/** Hour of day as the business sees it, not as the server sees it. */
const localHour = (iso: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );

const localDate = (iso: string) => {
  const p = localParts(new Date(iso), TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- timezone

test("wall-clock opening times survive British Summer Time", () => {
  // 10:00 on 1 September is BST, so 09:00Z. Getting this wrong shifts every
  // slot by an hour for seven months of the year.
  const tenAm = zonedToUtc(2026, 9, 1, 600, TZ);
  assert.equal(tenAm.toISOString(), "2026-09-01T09:00:00.000Z");

  // 10:00 on 1 December is GMT, so 10:00Z.
  const winter = zonedToUtc(2026, 12, 1, 600, TZ);
  assert.equal(winter.toISOString(), "2026-12-01T10:00:00.000Z");
});

test("slots are offered at the right wall-clock hour in either season", () => {
  const summer = findSlots({ ...base, limit: 1 });
  assert.equal(localHour(summer[0].starts_at), 10);

  const winter = findSlots({
    ...base,
    now: new Date("2026-11-30T08:00:00Z"),
    limit: 1,
  });
  assert.equal(localHour(winter[0].starts_at), 10);
});

// ---------------------------------------------------------------- opening hours

test("offers slots inside opening hours only", () => {
  const slots = findSlots({ ...base, limit: 20 });
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.ok(localHour(slot.starts_at) >= 10, `starts ${slot.starts_at}`);
    assert.ok(localHour(slot.ends_at) <= 18, `ends ${slot.ends_at}`);
  }
});

test("never offers a closed day", () => {
  const slots = findSlots({ ...base, limit: 50 });
  for (const slot of slots) {
    const weekday = localParts(new Date(slot.starts_at), TZ).weekday;
    assert.notEqual(weekday, 0, "offered a Sunday");
    assert.notEqual(weekday, 6, "offered a Saturday");
  }
});

test("returns nothing when the business is closed all week", () => {
  const shut = HOURS.map((h) => ({ ...h, closed: true }));
  assert.equal(findSlots({ ...base, hours: shut, limit: 5 }).length, 0);
});

// ---------------------------------------------------------------- notice

test("respects the notice period", () => {
  const slots = findSlots({ ...base, noticeHours: 48, limit: 5 });
  const earliest = NOW.getTime() + 48 * 3600_000;
  for (const slot of slots) {
    assert.ok(Date.parse(slot.starts_at) >= earliest, `${slot.starts_at} too soon`);
  }
});

// ---------------------------------------------------------------- clashes

test("never offers a slot that overlaps something booked", () => {
  // Tuesday 1 September, fully booked 10:00–18:00 local = 09:00–17:00Z.
  const busy = [{ starts_at: "2026-09-01T09:00:00Z", ends_at: "2026-09-01T17:00:00Z" }];
  const slots = findSlots({ ...base, busy, limit: 20 });
  for (const slot of slots) {
    assert.notEqual(localDate(slot.starts_at), "2026-09-01", "offered a full day");
  }
});

test("a slot ending exactly when a booking starts is still free", () => {
  const busy = [{ starts_at: "2026-09-01T11:00:00Z", ends_at: "2026-09-01T13:00:00Z" }];
  const slots = findSlots({ ...base, busy, limit: 50 });
  assert.ok(
    slots.some((s) => s.ends_at === "2026-09-01T11:00:00.000Z"),
    "an adjacent slot should be offerable",
  );
});

test("a long job is not squeezed into a short gap", () => {
  // Only a 90 minute hole on the Tuesday: 12:00–13:30 local (11:00–12:30Z).
  const busy = [
    { starts_at: "2026-09-01T09:00:00Z", ends_at: "2026-09-01T11:00:00Z" },
    { starts_at: "2026-09-01T12:30:00Z", ends_at: "2026-09-01T17:00:00Z" },
  ];

  const twoHours = findSlots({ ...base, busy, durationMinutes: 120, limit: 20 });
  for (const slot of twoHours) {
    assert.notEqual(
      localDate(slot.starts_at),
      "2026-09-01",
      "squeezed a 2 hour job into a 90 minute gap",
    );
  }

  const ninety = findSlots({ ...base, busy, durationMinutes: 90, limit: 20 });
  assert.ok(
    ninety.some((s) => s.starts_at === "2026-09-01T11:00:00.000Z"),
    "the 90 minute gap should be offered for a 90 minute job",
  );
});

// ---------------------------------------------------------------- guards

test("a job longer than the working day is never offered", () => {
  assert.equal(findSlots({ ...base, durationMinutes: 10 * 60, limit: 10 }).length, 0);
});

test("stops at the limit", () => {
  assert.equal(findSlots({ ...base, limit: 3 }).length, 3);
});

test("a zero or negative duration is rejected rather than looping", () => {
  assert.equal(findSlots({ ...base, durationMinutes: 0 }).length, 0);
  assert.equal(findSlots({ ...base, durationMinutes: -30 }).length, 0);
});

// ---------------------------------------------------------------- wording

test("slots are described in the business's own timezone", () => {
  const said = describeSlot(
    { starts_at: "2026-09-01T09:00:00Z", ends_at: "2026-09-01T10:00:00Z" },
    TZ,
  );
  assert.match(said, /Tuesday/);
  assert.match(said, /1 September/);
  assert.match(said, /10:00/); // 09:00Z is 10am in London during BST
});
