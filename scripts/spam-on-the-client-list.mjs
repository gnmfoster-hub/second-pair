/**
 * Client records that are nothing but a spammer.
 *
 *   node scripts/spam-on-the-client-list.mjs          reports
 *   node scripts/spam-on-the-client-list.mjs --fix    removes them
 *
 * Filing a thread as spam or paperwork was only ever a decision about the
 * thread. The sender stayed on the client list, so Living Canvas had three
 * agencies selling SEO and a Shopify receipt sitting among its tattoo clients,
 * each one a nameless row with an address nobody wants.
 *
 * Marking one now takes the record off as it goes, and the email that arrives
 * as paperwork never makes one at all. This is the same rule applied to what is
 * already on the books.
 *
 * The threads are untouched. They are the only record of the decision, and the
 * whole reason paperwork is a place rather than a bin is being able to look at
 * what was filed and say it was wrong.
 *
 * Only a record that exists for filed threads and nothing else. An appointment,
 * a payment, a signed form or a single conversation that is not spam all mean a
 * real client who happened to send one thing that got filed.
 */
import fs from "node:fs";
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

const write = process.argv.includes("--fix");

const { data: studios } = await db.from("studios").select("id, name");
const nameOf = new Map((studios ?? []).map((s) => [s.id, s.name]));

const { data: contacts } = await db.from("contacts").select("id, studio_id, name, email, phone");
const { data: threads } = await db
  .from("conversations")
  .select("id, contact_id, status, external_ref");

const byContact = new Map();
for (const t of threads ?? []) {
  if (!t.contact_id) continue;
  if (!byContact.has(t.contact_id)) byContact.set(t.contact_id, []);
  byContact.get(t.contact_id).push(t);
}

const filed = (s) => s === "spam" || s === "paperwork";

const candidates = [];
for (const c of contacts ?? []) {
  const mine = byContact.get(c.id) ?? [];
  if (!mine.length || !mine.every((t) => filed(t.status))) continue;

  /* The three things that mean a real client, asked one record at a time. */
  const [bookings, payments, forms] = await Promise.all([
    db.from("bookings").select("id", { count: "exact", head: true }).eq("contact_id", c.id),
    db.from("payments").select("id", { count: "exact", head: true }).eq("contact_id", c.id),
    db.from("client_forms").select("id", { count: "exact", head: true }).eq("contact_id", c.id),
  ]);

  // A failed count is not a nought. Kept, which is the safe way to be wrong.
  if (bookings.error || payments.error || forms.error) continue;
  if (bookings.count || payments.count || forms.count) continue;

  candidates.push({ ...c, threads: mine });
}

console.log("");
if (!candidates.length) {
  console.log(`Nothing on any client list that is only a filed thread. ${contacts?.length ?? 0} checked.`);
} else {
  console.log(`${candidates.length} client record${candidates.length === 1 ? "" : "s"} that exist only for filed threads:`);
  for (const c of candidates) {
    const who = c.name || c.email || c.phone || "no name";
    const what = c.threads.map((t) => `${t.status}: ${t.external_ref ?? "?"}`).join(", ");
    console.log(`    ${nameOf.get(c.studio_id) ?? c.studio_id} — ${who} (${what})`);
  }

  if (!write) {
    console.log("\n  Nothing removed. Run it again with --fix to take them off the client lists.");
    console.log("  The threads stay either way.");
    process.exitCode = 1;
  } else {
    /*
     * The link is cut before the record goes, and the order is not a style.
     *
     * conversations.contact_id cascades, so deleting a contact deletes every
     * thread they were in and every message in it. Straight to the delete and
     * this script would have destroyed the eleven spam and paperwork threads it
     * was written to tidy up around — which is the evidence for tuning the
     * filter, and the only record that any of it was ever filed.
     *
     * Checked by experiment on a throwaway row rather than read off the
     * migration, because the migration that made this column nullable reads as
     * though it had changed the cascade and had not.
     */
    let gone = 0;
    for (const c of candidates) {
      const { error: stillLinked } = await db
        .from("conversations")
        .update({ contact_id: null })
        .eq("contact_id", c.id);

      if (stillLinked) {
        console.log(`    left alone, could not unlink ${c.id}: ${stillLinked.message}`);
        continue;
      }

      const { error } = await db.from("contacts").delete().eq("id", c.id);
      if (error) console.log(`    could not remove ${c.id}: ${error.message}`);
      else gone += 1;
    }
    console.log(`\n  ${gone} taken off the client lists. Every thread is still there.`);
  }
}
