import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveContact } from "./resolve.ts";

/**
 * The picker can now correct an existing client's details while booking them.
 *
 * That is a write to a live customer's record from a form about something else,
 * which is the shape of thing that quietly loses somebody's phone number. These
 * tests are about what it must refuse to do as much as what it does.
 */

type Row = { id: string; studio_id: string; phone: string | null; email: string | null };

/**
 * Enough of supabase-js to answer the three calls resolveContact makes.
 *
 * Written out rather than mocked loosely, because the thing being tested is
 * which rows get written and a loose fake would pass whatever it was given.
 */
function fakeDb(rows: Row[]) {
  const updates: { id: string; put: Record<string, string> }[] = [];
  const inserts: Record<string, unknown>[] = [];

  /** Every row matching the eq() clauses collected so far. */
  const matching = (where: Record<string, unknown>) =>
    rows.filter((r) =>
      Object.entries(where).every((e) => (r as unknown as Record<string, unknown>)[e[0]] === e[1]),
    );

  const from = (table: string) => {
    assert.equal(table, "contacts");

    /*
     * One where-clause bag per from(), and each builder keeps its own. The
     * first version of this fake shared one and spread the read builder over
     * the write builder, so the write's eq() was replaced by the read's and
     * every update silently went nowhere. It reported the product as broken.
     */
    const reading: Record<string, unknown> = {};

    const read = {
      select: () => read,
      eq(column: string, value: unknown) {
        reading[column] = value;
        return read;
      },
      /* hasColumn's probe. Every column asked about exists here. */
      limit: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve({ data: matching(reading)[0] ?? null, error: null }),

      update(put: Record<string, string>) {
        const writing: Record<string, unknown> = {};
        const write = {
          eq(column: string, value: unknown) {
            writing[column] = value;
            return write;
          },
          /* Awaited, so it has to be thenable, and the write happens then. */
          then(resolve: (v: unknown) => void) {
            for (const hit of matching(writing)) {
              updates.push({ id: hit.id, put });
              Object.assign(hit, put);
            }
            resolve({ error: null });
          },
        };
        return write;
      },

      insert(row: Record<string, unknown>) {
        inserts.push(row);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "made-up" }, error: null }),
          }),
        };
      },
    };
    return read;
  };

  return { db: { from } as never, updates, inserts, rows };
}

const marie: Row = {
  id: "c1",
  studio_id: "s1",
  phone: "+447700900111",
  email: "marie@example.com",
};

test("booking a regular and changing nothing writes nothing", async () => {
  const { db, updates } = fakeDb([{ ...marie }]);
  const id = await resolveContact(db, "s1", { id: "c1", name: "Marie Whitlock" });
  assert.equal(id, "c1");
  assert.deepEqual(updates, []);
});

test("a new number typed over the old one is saved", async () => {
  const { db, updates } = fakeDb([{ ...marie }]);
  const id = await resolveContact(db, "s1", { id: "c1", phone: "+447700900222" });
  assert.equal(id, "c1");
  assert.deepEqual(updates, [{ id: "c1", put: { phone: "+447700900222" } }]);
});

test("the same number sent back is not a change", async () => {
  const { db, updates } = fakeDb([{ ...marie }]);
  await resolveContact(db, "s1", { id: "c1", phone: "+447700900111" });
  assert.deepEqual(updates, []);
});

/*
 * The one that matters. An empty box is a slip far more often than it is a
 * decision to take somebody's only phone number off them, and a contact with
 * phone "" reads as somebody reachable to every query that asks.
 */
test("an emptied box never clears what is there", async () => {
  const { db, updates, rows } = fakeDb([{ ...marie }]);
  await resolveContact(db, "s1", { id: "c1", phone: "", email: "   " });
  assert.deepEqual(updates, []);
  assert.equal(rows[0].phone, "+447700900111");
  assert.equal(rows[0].email, "marie@example.com");
});

test("an email is lowercased, and the same address in capitals is not a change", async () => {
  const { db, updates } = fakeDb([{ ...marie }]);
  await resolveContact(db, "s1", { id: "c1", email: "MARIE@example.com" });
  assert.deepEqual(updates, []);

  const second = fakeDb([{ ...marie }]);
  await resolveContact(second.db, "s1", { id: "c1", email: "Marie.W@Example.COM" });
  assert.deepEqual(second.updates, [{ id: "c1", put: { email: "marie.w@example.com" } }]);
});

test("both at once", async () => {
  const { db, updates } = fakeDb([{ ...marie }]);
  await resolveContact(db, "s1", { id: "c1", phone: "07700 900333", email: "new@example.com" });
  assert.deepEqual(updates, [
    { id: "c1", put: { phone: "07700 900333", email: "new@example.com" } },
  ]);
});

/*
 * The id comes off a form. Another business's customer must not be reachable
 * through it, and certainly must not be editable through it.
 */
test("another business's client is neither returned nor written to", async () => {
  const { db, updates } = fakeDb([{ ...marie }]);
  const id = await resolveContact(db, "s2", { id: "c1", phone: "+447700900999" });
  assert.equal(id, null);
  assert.deepEqual(updates, []);
});

test("a client who has been deleted comes back as nobody", async () => {
  const { db, updates } = fakeDb([]);
  assert.equal(await resolveContact(db, "s1", { id: "gone" }), null);
  assert.deepEqual(updates, []);
});

test("somebody with nothing on file gets their first number without fuss", async () => {
  const { db, updates } = fakeDb([{ id: "c2", studio_id: "s1", phone: null, email: null }]);
  await resolveContact(db, "s1", { id: "c2", phone: "+447700900444" });
  assert.deepEqual(updates, [{ id: "c2", put: { phone: "+447700900444" } }]);
});

/* Somebody new is still made, which is the path this function was written for. */
test("a name with no id becomes a client", async () => {
  const { db, inserts } = fakeDb([]);
  const id = await resolveContact(db, "s1", { name: "New Person", phone: "07700 900555" });
  assert.equal(id, "made-up");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].name, "New Person");
  assert.equal(inserts[0].phone, "07700 900555");
});

test("no name and no id is nobody, not an empty client", async () => {
  const { db, inserts } = fakeDb([]);
  assert.equal(await resolveContact(db, "s1", { name: "  " }), null);
  assert.deepEqual(inserts, []);
});
