/**
 * Columns the product writes and never reads, or reads and never writes.
 *
 * Five bugs in one day had the same shape: a column one half of the product
 * believes in and the other has never heard of. attended was read by four
 * screens and written by none, so every no-show figure was a confident zero.
 * personal_calendar_show was written by a form and read by nothing, so every
 * calendar ever connected was saved hidden. Each looked like a working feature
 * from whichever side you happened to be standing on.
 *
 *   node scripts/dead-columns.mjs
 *
 * It reports candidates, not faults. Checking them by hand is the job — its own
 * blind spot is real and worth knowing: accept_team_invite consumes an
 * invitation in SQL, so an earlier version that searched only src/ accused the
 * invite system of issuing single-use links that never get used up. They do.
 */
import fs from "node:fs";
import path from "node:path";

const sql = fs
  .readdirSync("supabase/migrations")
  .map((f) => fs.readFileSync(path.join("supabase/migrations", f), "utf8"))
  .join("\n");

const dropped = new Set();
for (const m of sql.matchAll(/drop column if exists ([a-z_]+)/gi)) dropped.add(m[1]);

const columns = new Set();
for (const m of sql.matchAll(/add column if not exists ([a-z_]+)/gi)) columns.add(m[1]);
for (const block of sql.matchAll(/create table (?:if not exists )?[a-z_]+ \(([\s\S]*?)\n\);/gi)) {
  for (const line of block[1].split("\n")) {
    const m = /^\s{2}([a-z_]+)\s+[a-z]/.exec(line);
    if (m && !["constraint", "primary", "unique", "foreign", "check"].includes(m[1])) {
      columns.add(m[1]);
    }
  }
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
})("src");

const source = files.map((f) => fs.readFileSync(f, "utf8"));

/* Names too generic to say anything about, and the plumbing every table has. */
const skip = new Set([
  "id", "created_at", "updated_at", "studio_id", "artist_id", "contact_id",
  "booking_id", "enquiry_id", "conversation_id", "service_id", "user_id",
  "sort_order", "active", "name", "label", "value", "kind", "status",
  "channel", "type", "note", "notes", "title", "body", "error", "minutes",
  "email", "content", "answer", "audience", "author", "enabled", "endpoint",
  "description", "cover_up", "app_id", "band_id", "calendar_id",
]);

const suspects = [];
for (const col of [...columns].sort()) {
  if (skip.has(col) || dropped.has(col) || col.length < 6) continue;

  // A write looks like `column: value` in an object literal.
  const write = new RegExp("\\b" + col + "\\s*:", "g");
  // A read looks like `.column`, `["column"]`, or the name inside a select().
  const read = new RegExp("[.\\[\"'`,\\s]" + col + "\\b", "g");

  let writes = 0;
  let reads = 0;
  for (const text of source) {
    writes += (text.match(write) ?? []).length;
    reads += (text.match(read) ?? []).length;
  }

  // What the database does to itself: a trigger, a default, or a function.
  if (new RegExp("set\\s+" + col + "\\s*=", "gi").test(sql)) writes += 1;
  if (new RegExp("^\\s*" + col + "\\s+[a-z].*default", "gim").test(sql)) writes += 1;

  // A write also matches the read pattern, so discount it.
  reads = Math.max(0, reads - writes);

  if (writes === 0 && reads === 0) suspects.push([col, "never mentioned at all"]);
  else if (writes === 0) suspects.push([col, "read, never written"]);
  else if (reads === 0) suspects.push([col, "written, never read"]);
}

for (const [col, verdict] of suspects) console.log(`${col.padEnd(30)} ${verdict}`);
console.log(`\n${suspects.length} candidates out of ${columns.size} columns`);
