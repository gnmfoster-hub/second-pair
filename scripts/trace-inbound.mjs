/**
 * What happened to an email that came in.
 *
 *   node scripts/trace-inbound.mjs
 *
 * Every email conversation started in the last three hours, with the messages
 * on it in order. The system lines are the useful part: they say why something
 * was parked rather than answered, which is the question actually being asked
 * when somebody reports that they emailed in and heard nothing back.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const since = new Date(Date.now() - 3 * 3600_000).toISOString();

const { data: convs } = await db
  .from("conversations")
  .select("id, channel, external_ref, status, ai_paused, created_at, last_message_at, studios(name)")
  .eq("channel", "email")
  .gte("created_at", since)
  .order("created_at", { ascending: false });

if (!convs?.length) {
  console.log("No email conversation created in the last three hours.");
  console.log("That means the webhook arrived but we did not get as far as writing anything down.");
}

for (const c of convs ?? []) {
  console.log("=".repeat(64));
  console.log(`${c.studios?.name} | from ${c.external_ref} | ${c.status}${c.ai_paused ? " (paused)" : ""}`);
  console.log(`created ${c.created_at}`);

  const { data: msgs } = await db
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", c.id)
    .order("created_at");

  for (const m of msgs ?? []) {
    const body = (m.content ?? "").replace(/\s+/g, " ").slice(0, 400);
    console.log(`\n  [${m.role}] ${m.created_at}`);
    console.log(`  ${body}`);
  }
}
