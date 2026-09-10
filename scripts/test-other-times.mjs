/**
 * "Have you got anything later?" — a real conversation, end to end.
 *
 * This is the failure a live customer reported: they were offered four times,
 * asked for later in the day, pressed the button for other options, and were
 * read the identical times back twice. The code fix is unit tested; what this
 * checks is the part unit tests cannot — whether the assistant actually
 * reaches for the new parameters when somebody says "later".
 *
 * Builds a throwaway cleaning firm shaped like the one that failed, talks to
 * it over the public widget endpoint, and deletes everything afterwards.
 *
 * Needs: `npm run dev` running, and ANTHROPIC_API_KEY in .env.local.
 * Run: node scripts/test-other-times.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.INKDESK_URL ?? "http://localhost:3000";

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
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

const stamp = Date.now();
const SLUG = `other-times-${stamp}`;
const SESSION = `ot${stamp}`.padEnd(16, "0").slice(0, 40);

const failures = [];
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures.push(name);
}

let studioId;

async function seed() {
  const { data: studio, error } = await db
    .from("studios")
    .insert({
      name: "Bright Spark Cleaning",
      slug: SLUG,
      vertical: "cleaner",
      tone: "Warm, plain, no waffle.",
      // The two settings that shaped the live failure: no deposit, which used
      // to skip the whole booking sequence, and a short consultation.
      deposit_mode: "none",
      consultation_minutes: 10,
      travel_mode: "at_customer",
      notice_hours: 24,
      privacy_notice_url: "https://example.test/privacy",
      hours: [
        { day: 0, open: "09:00", close: "18:00", closed: true },
        ...[1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "18:00", closed: false })),
        { day: 6, open: "09:00", close: "18:00", closed: true },
      ],
    })
    .select("id")
    .single();

  if (error) throw new Error("could not create the studio: " + error.message);
  studioId = studio.id;

  // Checked, because a rejected insert here does not throw — it comes back as
  // an error object, and the conversation then runs against a business with
  // nobody in it and quietly behaves like one with no diary. Which is exactly
  // what happened the first time this script was run.
  const person = await db.from("artists").insert({
    studio_id: studioId,
    name: "Ruth",
    active: true,
    booking_provider: "native",
    hourly_rate_pence: 2500,
    min_charge_pence: 6000,
  });
  if (person.error) throw new Error("no cleaner: " + person.error.message);

  const bands = await db.from("price_bands").insert([
    { studio_id: studioId, size_label: "Regular clean", hours_low: 2, hours_high: 3, duration_minutes: 120, sort_order: 0 },
    { studio_id: studioId, size_label: "End of tenancy", hours_low: 6, hours_high: 10, duration_minutes: 360, requires_consultation: true, sort_order: 1 },
  ]);
  if (bands.error) throw new Error("no services: " + bands.error.message);
}

async function cleanUp() {
  if (!studioId) return;
  const { data: convs } = await db.from("conversations").select("id").eq("studio_id", studioId);
  for (const c of convs ?? []) {
    const { data: enq } = await db.from("enquiries").select("id").eq("conversation_id", c.id);
    for (const e of enq ?? []) await db.from("bookings").delete().eq("enquiry_id", e.id);
    await db.from("enquiries").delete().eq("conversation_id", c.id);
    await db.from("messages").delete().eq("conversation_id", c.id);
  }
  await db.from("conversations").delete().eq("studio_id", studioId);
  await db.from("contacts").delete().eq("studio_id", studioId);
  await db.from("price_bands").delete().eq("studio_id", studioId);
  await db.from("artists").delete().eq("studio_id", studioId);
  await db.from("studios").delete().eq("id", studioId);
}

async function say(message) {
  const response = await fetch(`${BASE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: SLUG, session: SESSION, message }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  console.log(`\n      me:  ${message}`);
  console.log(`      it:  ${(data.reply ?? "(silent)").replace(/\n/g, "\n           ")}`);
  return data;
}

/** Every get_available_slots call so far, with what it was given and returned. */
async function slotCalls() {
  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("external_ref", SESSION)
    .maybeSingle();
  if (!conv) return [];

  const { data: rows } = await db
    .from("messages")
    .select("tool_calls")
    .eq("conversation_id", conv.id)
    .not("tool_calls", "is", null)
    .order("created_at");

  return (rows ?? [])
    .flatMap((r) => r.tool_calls ?? [])
    .filter((c) => c.name === "get_available_slots")
    .map((c) => ({
      input: c.input,
      // Not \S+: the result writes them as "(starts_at: <iso>)" and the
      // closing bracket comes along for the ride.
      times: [...String(c.result).matchAll(/starts_at: ([^)\s]+)/g)].map((m) => m[1]),
    }));
}

const hourIn = (iso) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );

try {
  console.log("Setting up a throwaway cleaning firm...\n");
  await seed();

  await say("hi, I need an end of tenancy clean on a 2 bed flat in Newton Abbot");
  await say("I'm Sam, 07700 900123, and it's 4 Marsh Road, TQ12 2AD");
  const offered = await say("what have you got?");

  let calls = await slotCalls();
  check("it offered times at all", calls.length > 0 && calls[0].times.length > 0);

  const firstTimes = calls.flatMap((c) => c.times);
  check(
    "it offered without being asked twice",
    Boolean(offered.reply),
  );

  await say("any of those later in the day? mornings are no good for me");

  calls = await slotCalls();
  const laterCall = calls[calls.length - 1];
  console.log(`\n      last call: get_available_slots(${JSON.stringify(laterCall.input)})`);
  console.log(`      returned:  ${laterCall.times.map((t) => t.slice(11, 16) + "Z").join(", ") || "(nothing)"}`);

  check(
    "it looked again rather than repeating itself",
    calls.length > 1,
    `${calls.length} calls`,
  );
  check(
    "it narrowed the search to later in the day",
    Boolean(laterCall.input.from_time) || Boolean(laterCall.input.different),
    JSON.stringify(laterCall.input),
  );

  const newTimes = laterCall.times.filter((t) => !firstTimes.includes(t));
  check(
    "the times it came back with are new ones",
    newTimes.length > 0,
    `${newTimes.length} of ${laterCall.times.length} not offered before`,
  );
  check(
    "and they are actually later in the day",
    laterCall.times.length > 0 && laterCall.times.every((t) => hourIn(t) >= 12),
    laterCall.times.map((t) => hourIn(t) + ":00").join(", "),
  );

  /*
   * The button case, word for word.
   *
   * This is what the widget sends when somebody presses "none of those — ask
   * for other times", and it carries no preference whatsoever. Nothing but the
   * exclusion can make it answer differently, which is what makes it the check
   * worth having: the step above could have passed on from_time alone.
   */
  const before = (await slotCalls()).flatMap((c) => c.times);
  await say("Have you got anything else? None of those work for me.");

  const afterCalls = await slotCalls();
  const buttonCall = afterCalls[afterCalls.length - 1];
  console.log(`\n      last call: get_available_slots(${JSON.stringify(buttonCall.input)})`);
  console.log(`      returned:  ${buttonCall.times.join(", ") || "(nothing)"}`);

  check(
    "the button made it look again",
    afterCalls.length > calls.length,
    `${afterCalls.length} calls in total`,
  );
  check(
    "and not one time it offered had been offered before",
    buttonCall.times.length > 0 && buttonCall.times.every((t) => !before.includes(t)),
    `${buttonCall.times.filter((t) => before.includes(t)).length} repeated`,
  );
} catch (error) {
  console.error("\n  BROKE: " + error.message);
  failures.push("threw");
} finally {
  console.log("\nCleaning up...");
  await cleanUp();
}

console.log(failures.length ? `\n${failures.length} failed: ${failures.join(", ")}` : "\nAll good.");
process.exit(failures.length ? 1 : 0);
