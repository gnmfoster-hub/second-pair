/**
 * Anybody whose last word was theirs.
 *
 * Read-only. Across the real businesses, the conversations where the newest
 * message is the customer's — so nothing has answered them, by assistant or by
 * person. The question worth asking after any outage, and worth asking on an
 * ordinary morning too.
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

const { data: studios } = await db
  .from("studios")
  .select("id, name, kind")
  .neq("kind", "demo")
  .is("archived_at", null);

for (const studio of studios ?? []) {
  const { data: convos } = await db
    .from("conversations")
    .select("id, channel, external_ref, status, last_message_at")
    .eq("studio_id", studio.id)
    .order("last_message_at", { ascending: false })
    .limit(50);

  const waiting = [];

  for (const c of convos ?? []) {
    const { data: last } = await db
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const newest = last?.[0];
    if (!newest || newest.role !== "client") continue;

    const hours = Math.round((Date.now() - Date.parse(newest.created_at)) / 3_600_000);
    waiting.push({ c, newest, hours });
  }

  console.log(`\n${studio.name}: ${waiting.length} waiting on a reply`);
  for (const w of waiting) {
    console.log(
      `  ${w.hours}h ago  ${w.c.channel.padEnd(9)} ${String(w.c.external_ref).padEnd(30)} [${w.c.status}]`,
    );
    console.log(`     "${w.newest.content.replace(/\s+/g, " ").slice(0, 120)}"`);
  }
}
