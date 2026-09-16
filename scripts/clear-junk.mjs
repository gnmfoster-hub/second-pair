/**
 * Remove named junk conversations, the way the inbox's own delete does.
 *
 * Takes a business and a list of sender addresses. Prints what it is about to
 * do, removes any reference photos first (nothing cascades a file), deletes the
 * conversation, and then the person — but only when nothing else of theirs
 * remains: another thread, an appointment, a payment or a form all mean a real
 * client who happened to have one thread deleted.
 *
 * Run: node scripts/clear-junk.mjs <slug> <address> [address...] [--go]
 * Without --go it only says what it would remove.
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

const args = process.argv.slice(2);
const go = args.includes("--go");
const [slug, ...addresses] = args.filter((a) => a !== "--go");

if (!slug || addresses.length === 0) {
  console.error("Usage: node scripts/clear-junk.mjs <slug> <address> [...] [--go]");
  process.exit(1);
}

const { data: studio } = await db.from("studios").select("id, name").eq("slug", slug).single();

const { data: convos } = await db
  .from("conversations")
  .select("id, external_ref, contact_id, created_at")
  .eq("studio_id", studio.id)
  .in("external_ref", addresses);

console.log(`${studio.name}: ${convos?.length ?? 0} of ${addresses.length} addresses found\n`);

for (const c of convos ?? []) {
  console.log(`  ${c.created_at.slice(0, 16)}  ${c.external_ref}`);

  if (!go) continue;

  // Photographs first: they are the only part that does not cascade, and rows
  // deleted before them would leave pictures nobody can find.
  const { data: enquiries } = await db
    .from("enquiries")
    .select("reference_urls")
    .eq("conversation_id", c.id);
  const files = (enquiries ?? []).flatMap((e) => e.reference_urls ?? []);
  if (files.length) await db.storage.from("references").remove(files);

  const { error } = await db.from("conversations").delete().eq("id", c.id);
  if (error) {
    console.log(`    could not remove it: ${error.message}`);
    continue;
  }

  if (c.contact_id) {
    const [{ count: threads }, { count: bookings }, { count: payments }, { count: forms }] =
      await Promise.all([
        db.from("conversations").select("id", { count: "exact", head: true }).eq("contact_id", c.contact_id),
        db.from("bookings").select("id", { count: "exact", head: true }).eq("contact_id", c.contact_id),
        db.from("payments").select("id", { count: "exact", head: true }).eq("contact_id", c.contact_id),
        db.from("client_forms").select("id", { count: "exact", head: true }).eq("contact_id", c.contact_id),
      ]);

    if (!threads && !bookings && !payments && !forms) {
      await db.from("contacts").delete().eq("id", c.contact_id);
      console.log("    gone, and the client with it");
    } else {
      console.log(`    gone; the client stays (${threads} threads, ${bookings} appointments)`);
    }
  } else {
    console.log("    gone");
  }
}

if (!go) console.log("\nNothing removed. Add --go to do it.");
