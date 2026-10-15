import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { whoIsActing, madeBy, recordBookingEvent } from "./bookingHistory.ts";
import { forgetColumns } from "./db/hasColumn.ts";

/**
 * A database that answers the two shapes this file uses, and remembers.
 *
 * `missing` is the set of tables or columns it has never heard of, which is
 * how a deploy that has landed before its migration behaves: PostgREST
 * refuses the whole statement rather than ignoring the part it does not know.
 */
function fakeDb(options: { missing?: string[]; artist?: string | null } = {}) {
  const missing = new Set(options.missing ?? []);
  const inserted: Record<string, unknown>[] = [];
  const warned: string[] = [];

  const db = {
    from(table: string) {
      const refusal = { error: { message: `column ${table} does not exist` } };
      return {
        select(column: string) {
          const known = !missing.has(table) && !missing.has(`${table}.${column}`);
          return {
            limit: async () => (known ? { error: null } : refusal),
            eq() {
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: options.artist === undefined ? null : { name: options.artist },
                  }),
                }),
              };
            },
          };
        },
        async insert(rows: Record<string, unknown>[]) {
          if (missing.has(table)) return refusal;
          inserted.push(...rows);
          return { error: null };
        },
      };
    },
  };

  return { db: db as never, inserted, warned };
}

/** hasColumn remembers its answers for the life of the process. */
beforeEach(() => forgetColumns());

const SOMEBODY = { id: "u1", name: "Amber Hurden" };

test("the name comes from the team list", async () => {
  const { db } = fakeDb({ artist: "Amber Hurden" });
  assert.deepEqual(await whoIsActing(db, "s1", "u1", "amber@example.com"), {
    id: "u1",
    name: "Amber Hurden",
  });
});

test("a login with no team row is named by its email, not by nothing", async () => {
  // Ugly and true beats "somebody".
  const { db } = fakeDb({ artist: null });
  assert.deepEqual(await whoIsActing(db, "s1", "u1", "karen@example.com"), {
    id: "u1",
    name: "karen@example.com",
  });
});

test("a new booking carries who made it", async () => {
  const { db } = fakeDb();
  assert.deepEqual(await madeBy(db, SOMEBODY), {
    created_by: "u1",
    created_by_name: "Amber Hurden",
  });
});

test("and carries nothing at all before the migration is run", async () => {
  // The whole insert would be refused for one unknown column, so a booking
  // typed into the diary would simply not save.
  const { db } = fakeDb({ missing: ["bookings.created_by"] });
  assert.deepEqual(await madeBy(db, SOMEBODY), {});
});

test("nobody acting writes no columns", async () => {
  const { db } = fakeDb();
  assert.deepEqual(await madeBy(db, null), {});
});

test("one press on a run of visits writes one line each", async () => {
  const { db, inserted } = fakeDb();
  await recordBookingEvent(db, {
    bookings: ["b1", "b2", "b3"],
    what: "cancelled",
    by: SOMEBODY,
    source: "diary",
  });

  assert.equal(inserted.length, 3);
  assert.deepEqual(inserted[0], {
    booking_id: "b1",
    what: "cancelled",
    by_user: "u1",
    by_name: "Amber Hurden",
    source: "diary",
    detail: null,
  });
});

test("the assistant is nobody rather than a made-up somebody", async () => {
  const { db, inserted } = fakeDb();
  await recordBookingEvent(db, { bookings: "b1", what: "booked", source: "assistant" });
  assert.equal(inserted[0].by_user, null);
  assert.equal(inserted[0].by_name, null);
  assert.equal(inserted[0].source, "assistant");
});

test("what changed is kept beside what happened", async () => {
  const { db, inserted } = fakeDb();
  await recordBookingEvent(db, {
    bookings: "b1",
    what: "moved",
    by: SOMEBODY,
    source: "diary",
    detail: { from: "2026-10-14T15:00:00Z", to: "2026-10-16T15:00:00Z" },
  });
  assert.deepEqual(inserted[0].detail, {
    from: "2026-10-14T15:00:00Z",
    to: "2026-10-16T15:00:00Z",
  });
});

test("nothing is written before the table exists, and nothing is thrown", async () => {
  const { db, inserted } = fakeDb({ missing: ["booking_events"] });
  await recordBookingEvent(db, { bookings: "b1", what: "booked", source: "diary" });
  assert.equal(inserted.length, 0);
});

test("a booking that did not save leaves no history and no error", async () => {
  // The insert loop skips a clashing date and passes a null id through.
  const { db, inserted } = fakeDb();
  await recordBookingEvent(db, {
    bookings: [null, undefined],
    what: "booked",
    source: "diary",
  });
  assert.equal(inserted.length, 0);
});

test("a database that throws does not take the save down with it", async () => {
  const angry = {
    from() {
      throw new Error("connection lost");
    },
  } as never;
  await recordBookingEvent(angry, { bookings: "b1", what: "booked", source: "diary" });
});
