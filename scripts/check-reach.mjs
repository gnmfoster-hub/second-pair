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

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: studios } = await admin.from("studios").select("id, name");

for (const studio of studios ?? []) {
  const { data: conns } = await admin
    .from("channel_connections").select("channel").eq("studio_id", studio.id).eq("active", true);
  const connected = [...new Set([...(conns ?? []).map((c) => c.channel), "web"])];

  const { data: contacts } = await admin
    .from("contacts")
    .select("id, name, phone, conversations(id, channel, external_ref, last_inbound_at)")
    .eq("studio_id", studio.id);

  console.log(`\n${studio.name}  — connected: ${connected.join(", ")}`);
  console.log("─".repeat(64));

  for (const c of contacts ?? []) {
    const routes = routesFor({
      conversations: c.conversations ?? [],
      phone: c.phone,
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
