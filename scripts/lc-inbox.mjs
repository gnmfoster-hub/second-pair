/**
 * What has actually been arriving in Living Canvas's inbox.
 *
 * Read-only. Prints the last two days of conversations with the first line of
 * each message, so a look at "these are all rubbish" can be a look at what they
 * really are rather than a guess.
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

const slug = process.argv[2] ?? "living-canvas-tattoo-nxst";
const days = Number(process.argv[3] ?? 2);

const { data: studio } = await db
  .from("studios")
  .select("id, name")
  .eq("slug", slug)
  .single();

const since = new Date(Date.now() - days * 86400_000).toISOString();

const { data: convos, error } = await db
  .from("conversations")
  .select("id, channel, external_ref, status, created_at, last_message_at")
  .eq("studio_id", studio.id)
  .gte("created_at", since)
  .order("created_at", { ascending: false });

if (error) throw error;

console.log(`${studio.name}: ${convos.length} conversations in the last ${days} days\n`);

for (const c of convos) {
  const { data: msgs } = await db
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", c.id)
    .order("created_at")
    .limit(4);

  const first = (msgs ?? [])[0];
  const head = (first?.content ?? "").replace(/\s+/g, " ").slice(0, 160);
  console.log(
    `— ${c.created_at.slice(0, 16)} ${c.channel.padEnd(9)} ${String(c.status).padEnd(9)}` +
      ` ${(msgs ?? []).length} msg`,
  );
  console.log(`  from: ${c.external_ref ?? "—"}`);
  console.log(`  "${head}"`);
  const replied = (msgs ?? []).find((m) => m.role === "assistant");
  if (replied) console.log(`  we said: "${replied.content.replace(/\s+/g, " ").slice(0, 120)}"`);
  console.log("");
}
