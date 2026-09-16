/**
 * A pupil asking for the same time every week, against the live demo.
 *
 * Talks to Dan's Driving School the way a customer would, then reads the diary
 * to see what actually went in. Deletes the conversation and the bookings it
 * made afterwards, so the demo is left as it was.
 *
 * Run: node --experimental-strip-types scripts/test-regular.mjs [slug]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.INKDESK_URL ?? "https://www.second-pair.com";
const SLUG = process.argv[2] ?? "dansdriving-demo";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
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

const session = `regular-test-${Date.now()}`.slice(0, 40);

async function say(message) {
  const r = await fetch(`${BASE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: SLUG, session, message }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${data.error ?? JSON.stringify(data)}`);
  console.log(`\n  pupil : ${message}`);
  console.log(`  school: ${(data.reply ?? "(silence)").replace(/\n/g, "\n          ")}`);
  return data;
}

const script = [
  "Hi, I'm after driving lessons — I've never driven before.",
  "Tom Reilly, 07700 900123. How much are they?",
  "My postcode is BS7 9AB and yes I've got my provisional.",
  "Go on then, what times have you got?",
];

for (const line of script) await say(line);

// Whatever it just offered, ask for it every week.
await say("Can I have the first one you said, and then the same time every week for 6 weeks?");

// ---------------------------------------------------------------- what landed
const { data: studio } = await db.from("studios").select("id").eq("slug", SLUG).single();
const { data: conv } = await db
  .from("conversations")
  .select("id, enquiry_id:id")
  .eq("studio_id", studio.id)
  .eq("external_ref", session)
  .maybeSingle();

const { data: enquiry } = await db
  .from("enquiries")
  .select("id")
  .eq("conversation_id", conv?.id ?? "")
  .maybeSingle();

const { data: booked } = await db
  .from("bookings")
  .select("id, starts_at, repeats, repeat_parent_id, deposit_status")
  .eq("enquiry_id", enquiry?.id ?? "")
  .is("cancelled_at", null)
  .order("starts_at");

console.log(`\n${"-".repeat(60)}\nWhat went in the diary: ${booked?.length ?? 0} bookings`);
for (const b of booked ?? []) {
  console.log(
    `  ${new Date(b.starts_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}` +
      `  repeats=${b.repeats ?? "—"}  ${b.repeat_parent_id ? "(follows the first)" : "(first)"}`,
  );
}

if (process.argv.includes("--keep")) {
  console.log("\nLeft in place (--keep).");
} else {
  for (const b of booked ?? []) await db.from("bookings").delete().eq("id", b.id);
  if (conv?.id) await db.from("conversations").delete().eq("id", conv.id);
  console.log("\nCleared up.");
}
