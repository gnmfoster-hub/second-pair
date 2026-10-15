/*
 * Take the long dash out of the live reminder templates.
 *
 * Not a style pass. A dash drops a text out of the GSM alphabet, which halves
 * a segment from 160 characters to 70: the message is charged twice and
 * forOneText trims it to one segment, so the last sentence never arrives.
 * That is the fault that ran from August, found again on 15 October in twelve
 * rows including the 24 hour reminder for all three live clients.
 *
 * The replacements are not invented. messageStarters.ts already writes this
 * exact sentence with a comma, and Kerbside, seeded after that rule, has it.
 * So these rows end up identical to what the product would write today.
 *
 *   node scripts/fix-template-dashes.mjs          say what would change
 *   node scripts/fix-template-dashes.mjs --write  change it
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
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

/*
 * After a greeting the dash becomes a comma, which is what the code writes.
 * Between two whole sentences it becomes a full stop. Nothing else changes:
 * no word is added, removed or reordered, because these are the businesses'
 * own words and repunctuating them is as far as this goes.
 */
function repunctuate(body) {
  return body
    .replace(/(See you tomorrow, \{\{name\}\}) — /g, "$1, ")
    .replace(/(Thanks \{\{name\}\}) — /g, "$1, ")
    .replace(/(Hi \{\{name\}\}) — /g, "$1, ")
    .replace(
      /just reply to this — it comes straight to us/g,
      "just reply to this. It comes straight to us",
    );
}

const dashed = /[—–]/;

const { data: studios } = await db.from("studios").select("id, slug");
const { data: all, error } = await db
  .from("reminder_templates")
  .select("id, studio_id, artist_id, hours_before, enabled, body");
if (error) throw new Error(`could not read the templates: ${error.message}`);

/*
 * Everything as it stands, before anything is touched.
 *
 * Into backups/, which is in .gitignore. These are live businesses' own
 * words to their own customers and they are never committed, the same rule
 * the nightly copy of the database follows.
 */
fs.mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const backup = new URL("../backups/template-bodies-before.json", import.meta.url);
fs.writeFileSync(backup, JSON.stringify(all, null, 1));
console.log(`${all.length} templates read. Backup written to ${backup.pathname}`);

const bad = all.filter((r) => dashed.test(r.body ?? ""));
console.log(`${bad.length} with a long dash in them.\n`);

let changed = 0;
const unmatched = [];

for (const r of bad) {
  const slug = studios.find((s) => s.id === r.studio_id)?.slug ?? r.studio_id;
  const next = repunctuate(r.body);

  if (next === r.body || dashed.test(next)) {
    unmatched.push(`${slug} ${r.hours_before}h`);
    continue;
  }

  console.log(`${slug}  ${r.hours_before}h  ${r.artist_id ? "own" : "business"}`);
  console.log(`  was: ${JSON.stringify(r.body)}`);
  console.log(`  now: ${JSON.stringify(next)}`);

  if (WRITE) {
    const { error: wrote } = await db
      .from("reminder_templates")
      .update({ body: next })
      .eq("id", r.id);
    if (wrote) {
      console.log(`  FAILED: ${wrote.message}`);
      continue;
    }
  }
  changed++;
}

console.log(
  `\n${changed} ${WRITE ? "changed" : "would change"}` +
    (unmatched.length ? `, ${unmatched.length} matched no rule: ${unmatched.join(", ")}` : ""),
);

/* Read back rather than trusting the writes. */
const { data: after } = await db.from("reminder_templates").select("id, studio_id, body");
const left = (after ?? []).filter((r) => dashed.test(r.body ?? ""));
console.log(`long dashes left in reminder_templates: ${left.length}`);
for (const r of left) {
  console.log("  still:", studios.find((s) => s.id === r.studio_id)?.slug, JSON.stringify(r.body));
}
