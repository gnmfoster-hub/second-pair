import { test } from "node:test";
import assert from "node:assert/strict";
import { findSlots } from "./slots.ts";
import type { OpeningHours } from "../types.ts";

/**
 * Asking for a different time and getting a different time.
 *
 * The finder walked from opening time and took the first free slots it found,
 * which is right for "when can I come in" and wrong for everything else. There
 * was no way to say afternoon, no way to say later, and no way to say not
 * those — so a customer who asked for any of the three was handed the same
 * nine o'clock, twice, and read it as an assistant that was not listening.
 */

// Monday 31 August 2026, 09:00 London (= 08:00Z, Britain being on BST).
const NOW = new Date("2026-08-31T08:00:00Z");
const TZ = "Europe/London";

const HOURS: OpeningHours[] = [
  { day: 0, open: "09:00", close: "18:00", closed: true },
  { day: 1, open: "09:00", close: "18:00", closed: false },
  { day: 2, open: "09:00", close: "18:00", closed: false },
  { day: 3, open: "09:00", close: "18:00", closed: false },
  { day: 4, open: "09:00", close: "18:00", closed: false },
  { day: 5, open: "09:00", close: "18:00", closed: false },
  { day: 6, open: "09:00", close: "18:00", closed: true },
];

const base = {
  hours: HOURS,
  busy: [],
  durationMinutes: 60,
  timezone: TZ,
  now: NOW,
  noticeHours: 24,
  limit: 4,
};

/** "14:30" where the business is, which is not where the server is. */
const at = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/** Minutes past midnight, read off the business's own wall clock. */
const localMinute = (iso: string) => {
  const [hours, mins] = at(iso).split(":").map(Number);
  return hours * 60 + mins;
};

test("without a time of day it still offers the soonest, as it always did", () => {
  const slots = findSlots({ ...base, perDay: 2 });
  assert.ok(slots.length > 0);
  assert.equal(at(slots[0].starts_at), "09:00");
});

test("the afternoon means the afternoon", () => {
  const slots = findSlots({ ...base, perDay: 2, fromMinute: 12 * 60 });
  assert.ok(slots.length > 0);
  for (const s of slots) {
    assert.ok(
      localMinute(s.starts_at) >= 12 * 60,
      `offered ${at(s.starts_at)}, which is not the afternoon`,
    );
  }
});

test("before half two means before half two", () => {
  const slots = findSlots({ ...base, perDay: 2, toMinute: 14 * 60 + 30 });
  assert.ok(slots.length > 0);
  for (const s of slots) {
    assert.ok(localMinute(s.starts_at) <= 14 * 60 + 30, `offered ${at(s.starts_at)}`);
  }
});

/*
 * The heart of it. Two calls, the second saying "not those", and not one time
 * in common — which is the thing that failed on a live site: the same four
 * came back and the assistant read them out again.
 */
test("asking for something else gets something else", () => {
  const first = findSlots({ ...base, perDay: 2 });
  const second = findSlots({
    ...base,
    perDay: 2,
    exclude: first.map((s) => s.starts_at),
  });

  assert.ok(second.length > 0, "there was more free and it offered nothing");
  const firstSet = new Set(first.map((s) => s.starts_at));
  for (const s of second) {
    assert.ok(!firstSet.has(s.starts_at), `${at(s.starts_at)} was offered already`);
  }
});

test("later in the day and not those, together", () => {
  const first = findSlots({ ...base, perDay: 2 });
  const second = findSlots({
    ...base,
    perDay: 2,
    fromMinute: 15 * 60,
    exclude: first.map((s) => s.starts_at),
  });

  assert.ok(second.length > 0);
  const firstSet = new Set(first.map((s) => s.starts_at));
  for (const s of second) {
    assert.ok(localMinute(s.starts_at) >= 15 * 60, `offered ${at(s.starts_at)}`);
    assert.ok(!firstSet.has(s.starts_at));
  }
});

/*
 * A quarter past is not a time anybody's diary works in. Starting the walk at
 * whatever minute they happened to say would offer 14:15, 14:45, 15:15 beside
 * a week of appointments all on the hour and the half hour.
 */
test("it keeps to the diary's own grid rather than the minute they said", () => {
  const slots = findSlots({ ...base, perDay: 2, fromMinute: 14 * 60 + 10 });
  assert.ok(slots.length > 0);
  for (const s of slots) {
    assert.equal(localMinute(s.starts_at) % 30, 0, `offered ${at(s.starts_at)}`);
    assert.ok(localMinute(s.starts_at) >= 14 * 60 + 10);
  }
});

/*
 * Never outside opening hours, whatever they ask for. This is the rule the
 * whole finder exists to keep, and a new way to ask is a new way to break it.
 */
test("a window past closing time offers nothing rather than something shut", () => {
  const slots = findSlots({ ...base, fromMinute: 22 * 60 });
  assert.deepEqual(slots, []);
});

test("a window too narrow for the appointment offers nothing", () => {
  // 17:30 to 18:00 is half an hour, and the appointment is an hour.
  const slots = findSlots({
    ...base,
    fromMinute: 17 * 60 + 30,
    toMinute: 18 * 60,
  });
  assert.deepEqual(slots, []);
});

test("an excluded time that is not free anyway changes nothing", () => {
  const plain = findSlots({ ...base, perDay: 2 });
  const same = findSlots({ ...base, perDay: 2, exclude: ["not-a-date", ""] });
  assert.deepEqual(same, plain);
});

/*
 * Excluding everything must not quietly wrap round and start again. An empty
 * list is the honest answer, and the tool has words for it.
 */
test("excluding everything free returns nothing, not the first one again", () => {
  const all = findSlots({ ...base, limit: 500 });
  const none = findSlots({ ...base, limit: 500, exclude: all.map((s) => s.starts_at) });
  assert.deepEqual(none, []);
});

/*
 * Neat & Tidy's real shape, and the offer a customer actually got.
 *
 * A ten-minute consultation, nine to six, an empty diary, two per day. Every
 * offer came back as nine o'clock and half past nine, on each of two days —
 * which the owner reported as "the same days and the same time". Two slots
 * half an hour apart is one option shown twice.
 */
test("a wide open day is offered across the day, not off the front of it", () => {
  const slots = findSlots({
    ...base,
    durationMinutes: 10,
    perDay: 2,
    limit: 4,
  });

  assert.equal(slots.length, 4);

  const byDay = new Map<string, number[]>();
  for (const s of slots) {
    const day = s.starts_at.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), localMinute(s.starts_at)]);
  }

  for (const [day, times] of byDay) {
    if (times.length < 2) continue;
    const gap = Math.max(...times) - Math.min(...times);
    assert.ok(
      gap >= 4 * 60,
      `on ${day} it offered ${times.map(t => Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0")).join(" and ")} — half an hour apart is one option twice`,
    );
  }
});

test("the soonest is still the first thing offered", () => {
  const slots = findSlots({ ...base, durationMinutes: 10, perDay: 2, limit: 4 });
  assert.equal(at(slots[0].starts_at), "09:00");
});

/*
 * A day with only one gap in it has nothing to spread. It must offer that gap,
 * not fall over and not offer it twice.
 */
test("a nearly full day offers what little it has", () => {
  const slots = findSlots({
    ...base,
    perDay: 3,
    limit: 4,
    busy: [
      // Tuesday, everything except 14:00-15:00.
      { starts_at: "2026-09-01T08:00:00Z", ends_at: "2026-09-01T13:00:00Z" },
      { starts_at: "2026-09-01T14:00:00Z", ends_at: "2026-09-01T17:00:00Z" },
    ],
    onOrAfter: "2026-09-01",
    onlyWeekday: 2,
  });

  const tuesday = slots.filter(s => s.starts_at.slice(0, 10) === "2026-09-01");
  assert.equal(tuesday.length, 1);
  assert.equal(at(tuesday[0].starts_at), "14:00");
});
