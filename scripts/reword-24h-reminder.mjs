/*
 * Take "See you tomorrow" out of the live day-before reminders.
 *
 *   node scripts/reword-24h-reminder.mjs          say what would change
 *   node scripts/reword-24h-reminder.mjs --write  change it
 *
 * Samantha's day-before reminder arrived at 08:07 on the morning of her
 * appointment, still opening "See you tomorrow". The cause was the sweep
 * running once a day, which is fixed separately; this is the other half. A
 * reminder can always be late, and a template that asserts which day it is
 * cannot always be right. {{when}} carries the day and the time in full, so
 * the wording does not have to.
 *
 * Only rows that are character-for-character one of the wordings we shipped,
 * plus Living Canvas's, which is the second of those with the reply sentence
 * taken off and is named here rather than matched. A business that has
 * written its own is reported and left alone.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

/* Every wording we have ever shipped at 24 hours, and what it becomes. */
const SWAPS = [
  [
    "See you tomorrow, {{name}}, {{practitioner}} will be with you {{when}}. Reply here if anything's changed.",
    "Just a reminder, {{name}}. {{practitioner}} will be with you {{when}}. Reply here if anything's changed.",
  ],
  [
    "See you tomorrow, {{name}}, {{when}} with {{practitioner}}. Reply here if anything's changed.",
    "Just a reminder, {{name}}. {{when}} with {{practitioner}}. Reply here if anything's changed.",
  ],
  /* Living Canvas: the one above with the reply sentence removed. */
  [
    "See you tomorrow, {{name}}, {{when}} with {{practitioner}}.",
    "Just a reminder, {{name}}. {{when}} with {{practitioner}}.",
  ],
];

const { data: studios } = await db.from("studios").select("id, slug");
const slugOf = Object.fromEntries((studios ?? []).map((s) => [s.id, s.slug]));

const { data: rows, error } = await db
  .from("reminder_templates")
  .select("id, studio_id, hours_before, body")
  .eq("hours_before", 24);
if (error) throw new Error(`could not read the templates: ${error.message}`);

fs.mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
fs.writeFileSync(
  new URL("../backups/24h-reminders-before.json", import.meta.url),
  JSON.stringify(rows, null, 1),
);

let changed = 0;
const theirOwn = [];

for (const r of rows ?? []) {
  const slug = slugOf[r.studio_id] ?? r.studio_id;
  const swap = SWAPS.find(([from]) => from === r.body);

  if (!swap) {
    if (/\btomorrow\b/i.test(r.body)) theirOwn.push(`${slug}: ${JSON.stringify(r.body)}`);
    continue;
  }

  console.log(`${WRITE ? "changing" : "would change"}  ${slug}`);
  console.log(`  now: ${swap[1]}`);
  if (WRITE) {
    const { error: wrote } = await db
      .from("reminder_templates")
      .update({ body: swap[1] })
      .eq("id", r.id);
    if (wrote) {
      console.log(`  FAILED: ${wrote.message}`);
      continue;
    }
  }
  changed++;
}

console.log(`\n${changed} ${WRITE ? "changed" : "to change"}`);
if (theirOwn.length) {
  console.log(`\nTheir own wording, still saying tomorrow, left alone:`);
  for (const t of theirOwn) console.log(`  ${t}`);
}

/* Read back rather than trusting the writes. */
const { data: after } = await db
  .from("reminder_templates")
  .select("studio_id, body")
  .eq("hours_before", 24);
const left = (after ?? []).filter((r) => /\btomorrow\b/i.test(r.body));
console.log(`\nstill saying tomorrow: ${left.length}`);
for (const r of left) console.log(`  ${slugOf[r.studio_id]}`);
