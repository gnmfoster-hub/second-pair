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

/*
 * Both halves of the product: the app, and the tools that read it.
 *
 * This walked only src/, so a column read solely by a script in scripts/ came
 * back as dead. model_spend.studio_slug was the case that gave it away — it is
 * selected and grouped by in api-spend.mjs, which is the entire reason that
 * column exists, and this called it written-and-never-read.
 *
 * Its own file is skipped, and only its own. It is the one place in the
 * repository that names columns in prose — every comment explaining a past
 * false positive mentions the column it was wrong about — and counting those
 * as reads would quietly hide the next real one.
 */
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|cjs)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
})("src");

for (const e of fs.readdirSync("scripts", { withFileTypes: true })) {
  if (!e.isFile() || e.name === "dead-columns.mjs") continue;
  if (/\.(ts|mjs|cjs)$/.test(e.name)) files.push(path.join("scripts", e.name));
}

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

/*
 * Columns that are unread on purpose, and why.
 *
 * Not skipped — still printed, under their own heading. A column nobody reads
 * is worth seeing whether or not it is deliberate; what is not worth anything
 * is the same three names appearing under "look at this" on every run until
 * the whole list stops being read. That has already happened once to
 * audit-setups, and the fix there was the same: say what a thing is rather
 * than hide it.
 *
 * Anything here is a claim about intent, so each one names its evidence.
 */
const KNOWN = {
  calendar_event_id:
    "bookings, from the first migration. A vestige of writing appointments back into an external calendar, which was never built — the product subscribes to a calendar instead (artists.personal_ical_url). Never written by anything, so there is nothing in it.",
  from_number:
    "calls. Deliberate: the migration says 'there is no screen that needs a customer's call log', and the caller's number is already on the conversation the call started.",
  to_number:
    "calls. The same decision as from_number — which line was rung is a fact about our own numbers, not something a business needs shown back to it.",
};

const suspects = [];
const deliberate = [];
for (const col of [...columns].sort()) {
  if (skip.has(col) || dropped.has(col) || col.length < 6) continue;

  /*
   * A write looks like `column: value` in an object literal.
   *
   * And like `column,` on its own, which is the same thing written the short
   * way. recordCost builds its insert as { month, supplier, pence, note } and
   * this reported supplier as read and never written: a column the back office
   * has a form for, reported as dead. One false name on a list like this costs
   * more than a missing one, because the whole list stops being read.
   *
   * Deliberately loose. A bare `supplier,` in an argument list counts too, and
   * over-counting writes only ever moves a column off the list, which is the
   * safe way for this to be wrong.
   */
  /*
   * And `row.column = value`, which this missed.
   *
   * It reported services.cost_pence as "read, never written" on the very day
   * the box that writes it went back on the price list, because that write
   * builds its object a property at a time — `cost.cost_pence = parsePounds()`
   * — rather than as a literal. A guard that calls a live feature dead is the
   * expensive kind of wrong: somebody believes it and deletes the reader.
   *
   * `(?!=)` keeps `col === something` a comparison rather than a write.
   */
  const write = new RegExp("\\b" + col + "\\s*(?:[:,]|=(?!=))", "g");
  /*
   * A read is a property access or the name in quotes.
   *
   * `row.texts_out` is the first. `select("id, texts_out")`, `.eq("seen_at", x)`
   * and `["cost_pence"]` are all the second, and a quoted name is never how a
   * value is written.
   *
   * This used to match any name after a comma or a space, which caught the
   * writes as well, so it subtracted the writes back off at the end. That
   * over-corrected the moment a column was written once and read once: the
   * per-channel meter writes texts_out and the billing screen reads it, one
   * each, and the subtraction reported it as written and never read. Four of
   * the sixteen names on this list were that.
   *
   * Counting the two things separately means neither has to be guessed back out
   * of the other.
   */
  const dotRead = new RegExp("\\." + col + "\\b", "g");
  /*
   * On one line, which the first attempt at this forgot.
   *
   * The gap either side excluded quotes and allowed newlines, so a quote
   * anywhere above the name and another anywhere below it counted as the name
   * sitting inside a string. That read the whole file as one long quoted
   * passage and reported everything as read: the list went from sixteen names
   * to two, which looked like a triumph until four of the fourteen turned out
   * to have no read anywhere.
   */
  const quotedRead = new RegExp("[\"'`][^\"'`\\n]*\\b" + col + "\\b[^\"'`\\n]*[\"'`]", "g");

  let writes = 0;
  let reads = 0;
  for (const text of source) {
    writes += (text.match(write) ?? []).length;
    reads += (text.match(dotRead) ?? []).length;
    reads += (text.match(quotedRead) ?? []).length;
  }

  // What the database does to itself: a trigger, a default, or a function.
  if (new RegExp("set\\s+" + col + "\\s*=", "gi").test(sql)) writes += 1;
  if (new RegExp("^\\s*" + col + "\\s+[a-z].*default", "gim").test(sql)) writes += 1;

  let verdict = null;
  if (writes === 0 && reads === 0) verdict = "never mentioned at all";
  else if (writes === 0) verdict = "read, never written";
  else if (reads === 0) verdict = "written, never read";
  if (!verdict) continue;

  (KNOWN[col] ? deliberate : suspects).push([col, verdict]);
}

for (const [col, verdict] of suspects) console.log(`${col.padEnd(30)} ${verdict}`);

console.log(
  `\n${suspects.length} to look at, out of ${columns.size} columns.` +
    (suspects.length ? "" : " Nothing stored that nothing reads."),
);

if (deliberate.length) {
  console.log(`\nUnread on purpose — ${deliberate.length}, and why:`);
  for (const [col, verdict] of deliberate) {
    console.log(`\n  ${col}  (${verdict})`);
    /* Wrapped by hand: a reason worth writing down is worth being able to
       read at the width of a terminal. */
    const words = KNOWN[col].split(" ");
    let line = "   ";
    for (const w of words) {
      if ((line + " " + w).length > 76) {
        console.log(line);
        line = "   ";
      }
      line += ` ${w}`;
    }
    if (line.trim()) console.log(line);
  }
}
