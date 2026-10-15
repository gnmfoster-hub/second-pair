/*
 * Bring the live two-day reminders in line with the shortened default.
 *
 *   node scripts/shorten-48h-reminder.mjs          say what would change
 *   node scripts/shorten-48h-reminder.mjs --write  change it
 *
 * The old wording filled out to 216 characters, so the sender kept the first
 * sentence and the parking and access advice reached nobody without an email
 * address. The new one arrives whole, in one text, for every live business.
 *
 * Only rows that are character-for-character the shipped default are touched.
 * A business that has written its own wording keeps it: the editor already
 * shows them what a text will carry, and rewriting somebody's own words
 * because they are long is not ours to do.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const WRITE = process.argv.includes("--write");

const OLD =
  "Hi {{name}}, {{practitioner}} from {{business}} is booked to come out to you {{when}}. " +
  "Please make sure there's somewhere to park and access to the work. Need to move it? Just reply here.";

const NEW =
  "Hi {{name}}, {{practitioner}} from {{business}} is coming {{when}}. " +
  "Please leave parking and access clear. Reply here to move it.";

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

const { data: studios } = await db.from("studios").select("id, slug, kind");
const { data: all, error } = await db
  .from("reminder_templates")
  .select("id, studio_id, hours_before, body");
if (error) throw new Error(`could not read the templates: ${error.message}`);

/* Before anything, into backups/, which is not committed. */
fs.mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
fs.writeFileSync(
  new URL("../backups/template-bodies-before-48h.json", import.meta.url),
  JSON.stringify(all, null, 1),
);

const theirs = [];
let changed = 0;

for (const r of all) {
  const slug = studios.find((s) => s.id === r.studio_id)?.slug ?? r.studio_id;
  if (r.hours_before !== 48) continue;

  if (r.body !== OLD) {
    /* Only worth naming where it is the travelling wording they have altered. */
    if (/park|access/.test(r.body)) theirs.push(slug);
    continue;
  }

  console.log(`${WRITE ? "changing" : "would change"}  ${slug}`);
  if (WRITE) {
    const { error: wrote } = await db
      .from("reminder_templates")
      .update({ body: NEW })
      .eq("id", r.id);
    if (wrote) {
      console.log(`  FAILED: ${wrote.message}`);
      continue;
    }
  }
  changed++;
}

console.log(`\n${changed} ${WRITE ? "changed" : "to change"}`);
if (theirs.length) console.log(`left alone, their own wording: ${theirs.join(", ")}`);

const { data: after } = await db
  .from("reminder_templates")
  .select("studio_id, body")
  .eq("hours_before", 48);
const stale = (after ?? []).filter((r) => r.body === OLD);
console.log(`still on the old default: ${stale.length}`);
