/**
 * Clients nobody can write back to, whose own thread knows the address.
 *
 *   node scripts/contacts-with-no-address.mjs          reports
 *   node scripts/contacts-with-no-address.mjs --fix    writes them
 *
 * A contact made from an inbound email or text used to be created with nothing
 * on it: the address lived on the conversation, as external_ref, and never
 * reached the person's own record. That was fixed on 16 September in
 * reachableFrom, and every contact made since carries it.
 *
 * Nothing went back for the ones already on the books. They sit on the client
 * list with no address and no number, so the business cannot send them a quote,
 * a receipt or a reminder, and check-reach reports them as unreachable. They are
 * not unreachable. The address is sitting on their own conversation, which is
 * where every reply to them has been going all along.
 *
 * Only ever fills in a blank. A contact that already has an address is left
 * exactly as it is, whatever the thread says, because somebody may have typed
 * a better one.
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

/* The same two judgements reachableFrom makes, so this cannot disagree with it. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const LOOKS_LIKE_PHONE = /^\+?[\d][\d\s().-]{6,20}$/;

function fromThread(channel, ref) {
  const key = (ref ?? "").trim();
  if (!key) return null;
  if (channel === "email") return LOOKS_LIKE_EMAIL.test(key) ? { email: key.toLowerCase() } : null;
  if (["sms", "whatsapp", "voice"].includes(channel)) {
    return LOOKS_LIKE_PHONE.test(key) ? { phone: key } : null;
  }
  return null;
}

const { data: studios } = await db.from("studios").select("id, name");
const nameOf = new Map((studios ?? []).map((s) => [s.id, s.name]));

const { data: contacts } = await db.from("contacts").select("id, studio_id, name, phone, email");
const { data: threads } = await db
  .from("conversations")
  .select("contact_id, channel, external_ref, last_message_at")
  .order("last_message_at", { ascending: false });

const byContact = new Map();
for (const t of threads ?? []) {
  if (!t.contact_id) continue;
  if (!byContact.has(t.contact_id)) byContact.set(t.contact_id, []);
  byContact.get(t.contact_id).push(t);
}

const found = [];
for (const c of contacts ?? []) {
  if (c.phone || c.email) continue;
  for (const t of byContact.get(c.id) ?? []) {
    const known = fromThread(t.channel, t.external_ref);
    // The newest thread that knows anything wins, which is the order they came
    // back in.
    if (known) {
      found.push({ ...c, known });
      break;
    }
  }
}

console.log("");
if (!found.length) {
  console.log(`Every client who can be written back to has it on their record. ${contacts?.length ?? 0} checked.`);
} else {
  console.log(`${found.length} client${found.length === 1 ? "" : "s"} with no address on the record, which their own thread knows:`);
  for (const f of found) {
    const what = f.known.email ?? f.known.phone;
    console.log(`    ${nameOf.get(f.studio_id) ?? f.studio_id} — ${f.name ?? "no name"} → ${what}`);
  }

  if (!write) {
    console.log("\n  Nothing written. Run it again with --fix to put these on the records.");
    process.exitCode = 1;
  } else {
    let done = 0;
    for (const f of found) {
      const { data, error } = await db
        .from("contacts")
        .update(f.known)
        .eq("id", f.id)
        /* Only a blank, even now: somebody may have typed one since the read. */
        .is("email", null)
        .is("phone", null)
        .select("id");
      if (error) console.log(`    could not write ${f.id}: ${error.message}`);
      else if (data?.length) done += 1;
    }
    console.log(`\n  ${done} written. The rest already had something.`);
  }
}
