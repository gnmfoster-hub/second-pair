import { test } from "node:test";
import assert from "node:assert/strict";
import { hasColumn, forgetColumns } from "./hasColumn.ts";

/**
 * A database that knows which columns exist, and counts how often it is asked.
 */
function fake(existing: string[]) {
  let asked = 0;
  const db = {
    from(table: string) {
      return {
        select(column: string) {
          return {
            limit(_n: number) {
              asked += 1;
              return existing.includes(`${table}.${column}`)
                ? Promise.resolve({ error: null })
                : Promise.resolve({ error: { message: `column ${column} does not exist` } });
            },
          };
        },
      };
    },
  };
  return { db: db as never, asks: () => asked };
}

test("a column that is there is there", async () => {
  forgetColumns();
  const { db } = fake(["channel_connections.updated_at"]);
  assert.equal(await hasColumn(db, "channel_connections", "updated_at"), true);
});

test("a column whose migration has not been run yet is not there", async () => {
  forgetColumns();
  const { db } = fake([]);
  assert.equal(await hasColumn(db, "channel_connections", "updated_at"), false);
});

test("a yes is asked once and remembered", async () => {
  forgetColumns();
  const { db, asks } = fake(["contacts.marketing_consent_at"]);
  for (let i = 0; i < 5; i++) await hasColumn(db, "contacts", "marketing_consent_at");
  assert.equal(asks(), 1);
});

/*
 * The one that matters. Migrations are run by hand against a server that stays
 * up, so a "not yet" that is never revisited means the column quietly goes on
 * being unwritten long after it exists.
 */
test("a no is re-asked later, so a migration run at midnight takes effect", async () => {
  forgetColumns();
  const { db, asks } = fake([]);

  assert.equal(await hasColumn(db, "studios", "later", 0), false);
  assert.equal(await hasColumn(db, "studios", "later", 5_000), false);
  assert.equal(asks(), 1, "asked again within the minute");

  const arrived = fake(["studios.later"]);
  assert.equal(await hasColumn(arrived.db, "studios", "later", 120_000), true);
});

test("two columns are two questions", async () => {
  forgetColumns();
  const { db } = fake(["studios.one"]);
  assert.equal(await hasColumn(db, "studios", "one"), true);
  assert.equal(await hasColumn(db, "studios", "two"), false);
});
