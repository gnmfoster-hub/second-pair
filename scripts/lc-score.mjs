/**
 * Score the mail that actually arrived against the cold-pitch rules.
 *
 * Read-only. Prints each message and what coldPitch made of it, so a rule can
 * be judged against the real thing rather than against an imagined spammer.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { coldPitch } from "../src/lib/messaging/coldPitch.ts";

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
const days = Number(process.argv[3] ?? 7);

const { data: studio } = await db.from("studios").select("id, name, email").eq("slug", slug).single();
const since = new Date(Date.now() - days * 86400_000).toISOString();

const { data: convos } = await db
  .from("conversations")
  .select("id, external_ref, status, created_at")
  .eq("studio_id", studio.id)
  .eq("channel", "email")
  .gte("created_at", since)
  .order("created_at", { ascending: false });

for (const c of convos ?? []) {
  const { data: msgs } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", c.id)
    .eq("role", "client")
    .order("created_at")
    .limit(1);

  const said = msgs?.[0]?.content ?? "";
  // The webhook stores subject and body joined by a blank line.
  const [subject, ...rest] = said.split("\n\n");
  const verdict = coldPitch(
    { from: c.external_ref, subject, body: rest.join("\n\n") },
    { name: studio.name, sites: [(studio.email ?? "").split("@")[1]].filter(Boolean) },
  );

  console.log(`\n${"=".repeat(70)}`);
  console.log(`${c.created_at.slice(0, 16)}  ${c.external_ref}  [${c.status}]`);
  console.log(`score ${verdict.score} → ${verdict.pitch ? "PITCH" : "answered as a customer"}`);
  if (verdict.signs.length) console.log(`signs: ${verdict.signs.join(" | ")}`);
  console.log("-".repeat(70));
  console.log(said.slice(0, 900));
}
