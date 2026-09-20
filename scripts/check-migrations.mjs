/**
 * Which migrations have not reached the live database.
 *
 *   node scripts/check-migrations.mjs
 *
 * Written after taking the diary out for every business at once. A query that
 * names a column the database does not have is rejected whole by PostgREST —
 * so the screen does not lose a field, it loses everything, and shows an empty
 * day to somebody whose day is full. The code was right and the migration had
 * not been pasted yet, and nothing anywhere said so.
 *
 * This is the check that would have caught it in two seconds. Run it before
 * pushing anything that reads a new column, and after running a migration to
 * confirm it actually landed.
 *
 * It compares what the migration files declare against what the database
 * answers to. It cannot see constraints, policies, functions or triggers —
 * only tables and columns, which is where this class of failure lives.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const dir = "supabase/migrations";
const files = fs.readdirSync(dir).sort();

/*
 * What a later migration took away again.
 *
 * Without this the tool cries wolf about every column ever dropped, and a
 * check that reports a fault on a healthy database is a check somebody stops
 * running — which is worse than not having written it.
 */
const all = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
const dropped = new Set();
for (const m of all.matchAll(/drop column if exists ([a-z_]+)/gi)) dropped.add(m[1]);
for (const m of all.matchAll(/drop table if exists ([a-z_]+)/gi)) dropped.add(m[1]);

/*
 * What each file expects to exist afterwards.
 *
 * Only the two statements that this failure mode cares about. A migration that
 * adds an index or a policy and nothing else reports as nothing to check,
 * which is honest — this cannot tell you whether that one ran.
 */
function expectations(sql) {
  const tables = new Set();
  const columns = [];

  for (const m of sql.matchAll(/create table (?:if not exists )?([a-z_]+)\s*\(/gi)) {
    tables.add(m[1]);
  }

  for (const m of sql.matchAll(
    /alter table\s+([a-z_]+)([\s\S]*?);/gi,
  )) {
    const table = m[1];
    for (const c of m[2].matchAll(/add column (?:if not exists )?([a-z_]+)/gi)) {
      columns.push([table, c[1]]);
    }
  }

  return { tables: [...tables], columns };
}

let missing = 0;
let unchecked = 0;

for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  const { tables, columns } = expectations(sql);

  if (!tables.length && !columns.length) {
    unchecked += 1;
    continue;
  }

  const faults = [];

  for (const table of tables) {
    if (dropped.has(table)) continue;
    const { error } = await db.from(table).select("*").limit(0);
    // A table nobody can see and a table that is not there look the same from
    // here; either way the code that reads it is not working.
    if (error) faults.push(`table ${table} — ${error.message}`);
  }

  for (const [table, column] of columns) {
    if (dropped.has(column)) continue;
    const { error } = await db.from(table).select(column).limit(0);
    if (error) faults.push(`${table}.${column}`);
  }

  if (faults.length) {
    missing += 1;
    console.log(`\n✗ ${file}`);
    for (const f of faults) console.log(`    ${f}`);
  }
}

/*
 * And the columns the code guards, whether or not a migration file says so.
 *
 * Everything above compares the migration files against the database, so a
 * column with no file of its own is not checked: nothing declares it, so
 * nothing looks for it. That is exactly the shape of the one this missed.
 * artists.trading_name was written, deployed and guarded, the SQL was pasted
 * into the worklist for Giles rather than into supabase/migrations, and this
 * script said every migration had landed while the box he was hunting for
 * silently did nothing.
 *
 * hasColumn is the honest list of what the code is waiting for. A guard exists
 * only because somebody shipped ahead of a migration, so every one of them is
 * a question worth asking the live database directly.
 *
 * A guard on a column that has landed is not a fault, it is just a guard that
 * can go. Those are listed separately and change nothing.
 *
 * Tests are skipped. hasColumn's own tests call it with studios.one and
 * studios.two against a fake database, and those are not columns anybody
 * expects to find: the first run of this reported three faults on a healthy
 * database, which is how a check gets ignored.
 */
const guards = new Map();
const srcFiles = [];
(function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) srcFiles.push(full);
  }
})("src");

for (const file of srcFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/hasColumn\(\s*\w+\s*,\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"/g)) {
    const key = `${m[1]}.${m[2]}`;
    if (!guards.has(key)) guards.set(key, [m[1], m[2]]);
  }
}

const guarding = [];
for (const [key, [table, column]] of guards) {
  const { error } = await db.from(table).select(column).limit(0);
  if (error) guarding.push(key);
}

if (guarding.length) {
  console.log("\n✗ columns the code is guarding that the database still lacks");
  for (const g of guarding) console.log(`    ${g}`);
  console.log("\n  The guard means nothing breaks, so nobody is shown an error: the");
  console.log("  setting is simply there and does nothing when it is filled in.");
  missing += guarding.length;
}

/*
 * And the fixed lists, which fail in a nastier way than a missing column.
 *
 * A status is a Postgres enum. Naming a value it has not been told about does
 * not return nothing — PostgREST refuses the whole statement, so a query that
 * mentions it loses every row it would have returned. That emptied every inbox
 * on the platform for an hour: one filter, added the same day as the value,
 * against a database that had not had the migration run yet.
 *
 * Three times this month the same shape — the trade fields, the per-channel
 * meter, and this. So it is checked rather than remembered: every value in the
 * TypeScript union is asked for, and any the database does not know is named
 * here before anybody finds it on a live screen.
 */
const ENUMS = [
  { type: "ConvStatus", table: "conversations", column: "status" },
  { type: "DepositStatus", table: "bookings", column: "deposit_status" },
];

const types = fs.readFileSync("src/lib/types.ts", "utf8");
const unknown = [];

for (const { type, table, column } of ENUMS) {
  /*
   * Up to the semicolon that ends the line, not the first one anywhere.
   *
   * These unions carry comments, and a comment carries prose — "a number worth
   * watching; spam is a number worth removing" ended the declaration four
   * values early, so the one value that was actually missing was the one this
   * never looked at. The check passed while the thing it checks was broken,
   * which is the fault it was written to catch, in the check itself.
   */
  const declared = new RegExp("export type " + type + " =([\\s\\S]*?);\\s*\\n").exec(types);
  if (!declared) continue;

  // Quoted values only, so a word out of a comment is never mistaken for one.
  const values = [...declared[1].matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1]);
  for (const value of values) {
    const { error } = await db.from(table).select("id").eq(column, value).limit(0);
    if (error && /invalid input value for enum/.test(error.message)) {
      unknown.push(`${table}.${column} has no "${value}" — ${type} says it should`);
    }
  }
}

if (unknown.length) {
  console.log("\n✗ values the code uses and the database has never heard of");
  for (const u of unknown) console.log(`    ${u}`);
  console.log("\n  These are worse than a missing column: a query naming one is refused");
  console.log("  whole, so it loses every row rather than one field.");
  missing += unknown.length;
}

console.log("");
if (missing) {
  console.log(`${missing} migration${missing === 1 ? "" : "s"} not applied.`);
  console.log("Anything reading those columns is returning nothing at all, not a blank field.");
  process.exitCode = 1;
} else {
  console.log(`Every migration has landed. ${unchecked} had nothing this can check.`);
}
