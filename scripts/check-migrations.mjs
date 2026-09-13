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

console.log("");
if (missing) {
  console.log(`${missing} migration${missing === 1 ? "" : "s"} not applied.`);
  console.log("Anything reading those columns is returning nothing at all, not a blank field.");
  process.exitCode = 1;
} else {
  console.log(`Every migration has landed. ${unchecked} had nothing this can check.`);
}
