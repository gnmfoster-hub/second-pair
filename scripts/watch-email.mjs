/**
 * Wait for the next email to arrive, and say so once.
 *
 *   node scripts/watch-email.mjs [minutes]
 *
 * The companion to trace-inbound, for the other half of the question. That one
 * answers "did it arrive?" after the fact; this one is for standing over a
 * forwarding rule somebody has just switched on, when the useful answer is
 * either "yes, just now" or a definite silence rather than a refresh every
 * thirty seconds.
 *
 * Exits the moment something lands, or when the time is up. One line either
 * way, because it is read by something that treats every line as an event.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const minutes = Number(process.argv[2]) || 40;
const deadline = Date.now() + minutes * 60_000;

// Anything already in the table is not news. The watch starts now.
const from = new Date().toISOString();

while (Date.now() < deadline) {
  const { data, error } = await db
    .from("conversations")
    .select("channel, external_ref, created_at, studios(name)")
    .eq("channel", "email")
    .gte("created_at", from)
    .order("created_at", { ascending: false })
    .limit(1);

  // A blip in the network is not an answer, so it is not reported as one.
  if (!error && data?.length) {
    const c = data[0];
    console.log(`EMAIL ARRIVED — ${c.studios?.name} — from ${c.external_ref} at ${c.created_at}`);
    process.exit(0);
  }

  await new Promise((r) => setTimeout(r, 60_000));
}

console.log(`NOTHING IN ${minutes} MINUTES — no email reached any business since ${from}`);
