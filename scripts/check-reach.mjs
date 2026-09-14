/**
 * Who can actually be messaged, and why not.
 *
 *   node scripts/check-reach.mjs
 *
 * Prints the real routes for every client in the database. The rule is unit
 * tested; this is the other half — whether the data it runs on is the shape
 * the rule expects.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { routesFor, channelLabel } from "../src/lib/messaging/reach.ts";
import { connectedChannels } from "../src/lib/messaging/connections.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/*
 * What the live site has plugged in, asked of the live site.
 *
 * connectedChannels decides email and text off the environment, and the
 * environment that matters is Vercel's — the Resend and Twilio keys are not in
 * .env.local and never should be. Run here with nothing set, it answers "no
 * email, no texts" for every business on the platform, which is the opposite
 * of the truth and reads as a fault in the product.
 *
 * So the presence of each key is read from /api/health, which reports exactly
 * that and never a value, and set here as a flag. Nothing is fetched that the
 * health endpoint would not tell anybody holding CRON_SECRET, and no key is
 * copied: what is set below is the word "live", which is enough for a check
 * whose whole question is whether something is configured at all.
 */
const SITE = process.env.SITE_URL ?? "https://www.second-pair.com";
let asLive = false;

if (env.CRON_SECRET) {
  try {
    const res = await fetch(`${SITE}/api/health?key=${encodeURIComponent(env.CRON_SECRET)}`);
    if (res.ok) {
      const can = await res.json();
      if (can?.email?.configured) {
        process.env.RESEND_API_KEY = "live";
        process.env.EMAIL_FROM = "live@second-pair.com";
      }
      if (can?.texts?.configured) {
        process.env.TWILIO_ACCOUNT_SID = "live";
        process.env.TWILIO_AUTH_TOKEN = "live";
        process.env.TWILIO_FROM_NUMBER = "live";
      }
      asLive = true;
    }
  } catch {
    // Answered below rather than thrown: a report of what is on file is still
    // worth having when the site cannot be reached.
  }
}

if (!asLive) {
  console.log("");
  console.log(
    "Could not ask the live site what is configured, so email and text are " +
      "treated as off below. Every x against them is this, not the product.",
  );
}

const { data: studios } = await admin.from("studios").select("id, name");

for (const studio of studios ?? []) {
  /*
   * The application's own answer, not a second copy of it.
   *
   * This read channel_connections straight and called that the list, which is
   * two rules short of what the product does: email is one account of ours and
   * is on for every business whenever the key is set, and text messages come
   * off the list when the Twilio keys are missing however many numbers are
   * registered. So this reported that a business with a perfectly good email
   * address could not be emailed — a check that says the product is more
   * broken than it is, which costs somebody an afternoon looking for a fault
   * that is in the check.
   */
  const connected = await connectedChannels(admin, studio.id);

  /*
   * And the email address, which was never selected and never passed. The rule
   * was being asked whether somebody could be reached with half of what it
   * needs to answer, so the answer was no for everybody, every time.
   */
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, name, phone, email, conversations(id, channel, external_ref, last_inbound_at)")
    .eq("studio_id", studio.id);

  console.log(`\n${studio.name}  — connected: ${connected.join(", ")}`);
  console.log("─".repeat(64));

  for (const c of contacts ?? []) {
    const routes = routesFor({
      conversations: c.conversations ?? [],
      phone: c.phone,
      email: c.email,
      connected,
    });
    const open = routes.filter((r) => r.open);
    const label = (c.name ?? c.phone ?? "Unnamed").padEnd(22);

    if (open.length) {
      console.log(`  ${label} → ${open.map((r) => channelLabel(r.channel)).join(", ")}`);
    } else if (routes.length) {
      console.log(`  ${label} ✕ ${routes[0].blocked}`);
    } else {
      console.log(`  ${label} ✕ no channel and no number on file`);
    }
  }
}
