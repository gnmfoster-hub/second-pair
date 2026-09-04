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

// ------------------------------------------------------ one person's own week
//
// Opening hours used to be the business's only, so a stylist working Tuesday,
// Thursday and Saturday could not be described — and the assistant offered her
// a Monday. findSlots takes whichever week it is handed; these prove it
// honours a narrower one rather than falling back to the business's.

test("somebody who does not work Mondays is not offered one", () => {
  const tuesdayThursdaySaturday = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: "09:00",
    close: "17:00",
    closed: ![2, 4, 6].includes(day),
  }));

  const slots = findSlots({
    hours: tuesdayThursdaySaturday,
    busy: [],
    durationMinutes: 60,
    timezone: "Europe/London",
    noticeHours: 0,
    limit: 40,
    // A Monday.
    now: new Date("2026-09-07T08:00:00Z"),
  });

  const days = new Set(
    slots.map((s) =>
      new Date(s.starts_at).toLocaleDateString("en-GB", {
        weekday: "long",
        timeZone: "Europe/London",
      }),
    ),
  );

  assert.equal(days.has("Monday"), false, [...days].join(", "));
  assert.equal(days.has("Tuesday"), true);
});

test("a narrower week still offers the days it does work", () => {
  const saturdaysOnly = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: "10:00",
    close: "14:00",
    closed: day !== 6,
  }));

  const slots = findSlots({
    hours: saturdaysOnly,
    busy: [],
    durationMinutes: 60,
    timezone: "Europe/London",
    noticeHours: 0,
    limit: 10,
    now: new Date("2026-09-07T08:00:00Z"),
  });

  assert.ok(slots.length > 0, "a Saturday-only week should still offer Saturdays");
  for (const slot of slots) {
    const day = new Date(slot.starts_at).toLocaleDateString("en-GB", {
      weekday: "long",
      timeZone: "Europe/London",
    });
    assert.equal(day, "Saturday", `offered a ${day}`);
  }
});

// ----------------------------------------- working late on one particular day

/** Nine to five, Monday to Friday. 2026-03-05 is a Thursday. */
const lateDayHours: OpeningHours[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  open: "09:00",
  close: "17:00",
  closed: day === 0 || day === 6,
}));

const lateBase = {
  hours: lateDayHours,
  busy: [],
  durationMinutes: 60,
  timezone: "Europe/London",
  noticeHours: 0,
  daysAhead: 1,
  limit: 40,
  now: new Date("2026-03-05T08:00:00Z"),
};

const clockTimes = (slots: { starts_at: string }[]) =>
  slots.map((s) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(s.starts_at)),
  );

test("without extra hours nothing is offered after closing", () => {
  const times = clockTimes(findSlots(lateBase));
  assert.ok(!times.some((t) => t >= "17:00"), `offered ${times.filter((t) => t >= "17:00")}`);
});

test("staying late on one day opens that evening", () => {
  const times = clockTimes(
    findSlots({ ...lateBase, extraHours: [{ date: "2026-03-05", open: "17:00", close: "21:00" }] }),
  );
  assert.ok(times.includes("18:00"), `expected an evening slot, got ${times}`);
  assert.ok(times.includes("20:00"), "the last hour before nine should be offered");
  assert.ok(!times.includes("21:00"), "nothing may start at closing");
});

test("it applies to that date only", () => {
  // The extra evening is Thursday; Friday must be untouched.
  const slots = findSlots({
    ...lateBase,
    daysAhead: 2,
    extraHours: [{ date: "2026-03-05", open: "17:00", close: "21:00" }],
  });
  const friday = slots.filter((s) => s.starts_at.startsWith("2026-03-06"));
  assert.ok(friday.length > 0, "Friday should still have its normal day");
  assert.ok(!clockTimes(friday).some((t) => t >= "17:00"), "Friday must not inherit the late night");
});

test("coming in on a day they are normally closed", () => {
  // Saturday, which is shut. The extra period stands on its own.
  const times = clockTimes(
    findSlots({
      ...lateBase,
      now: new Date("2026-03-07T06:00:00Z"),
      extraHours: [{ date: "2026-03-07", open: "10:00", close: "14:00" }],
    }),
  );
  assert.ok(times.includes("10:00"), `expected a Saturday morning, got ${times}`);
  assert.ok(!times.includes("09:00"), "nothing before the extra period starts");
});

// ------------------------------------- the seam that would lose long bookings

test("an evening that runs on from the working day is one stretch", () => {
  /*
   * Nine to five widened to nine at night is one window, not two. Treated as
   * two, the slot stepping restarts at five and no appointment long enough to
   * straddle it can ever be offered — so a three-hour job would silently lose
   * the 15:00 and 16:00 starts that are perfectly available.
   */
  const long = findSlots({
    ...lateBase,
    durationMinutes: 180,
    extraHours: [{ date: "2026-03-05", open: "17:00", close: "21:00" }],
  });
  const times = clockTimes(long);
  assert.ok(times.includes("15:00"), `a three-hour job should still start at 3pm, got ${times}`);
  assert.ok(times.includes("18:00"), "and in the evening");
});

test("a gap between the day and the extra period is respected", () => {
  // Back at seven after a break — nothing may be offered between five and seven.
  const times = clockTimes(
    findSlots({ ...lateBase, extraHours: [{ date: "2026-03-05", open: "19:00", close: "21:00" }] }),
  );
  assert.ok(!times.includes("17:00"), "closed at five means closed at five");
  assert.ok(!times.includes("18:00"), "still closed at six");
  assert.ok(times.includes("19:00"), "open again at seven");
});

test("nonsense extra hours are ignored rather than obeyed", () => {
  for (const bad of [
    { date: "2026-03-05", open: "21:00", close: "17:00" },
    { date: "2026-03-05", open: "", close: "" },
  ]) {
    const times = clockTimes(findSlots({ ...lateBase, extraHours: [bad] }));
    assert.ok(!times.some((t) => t >= "17:00"), `${JSON.stringify(bad)} opened the evening`);
  }
});

test("a booking already in the evening still blocks that time", () => {
  const times = clockTimes(
    findSlots({
      ...lateBase,
      extraHours: [{ date: "2026-03-05", open: "17:00", close: "21:00" }],
      busy: [{ starts_at: "2026-03-05T18:00:00Z", ends_at: "2026-03-05T19:00:00Z" }],
    }),
  );
  assert.ok(!times.includes("18:00"), "the evening is not a free-for-all");
  assert.ok(times.includes("19:00"), "but the rest of it is still offered");
});
