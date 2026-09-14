import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local","utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g,"");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: s } = await db.from("studios").select("id").eq("slug","neat-tidy-solutions").single();
const { data: convs } = await db.from("conversations")
  .select("id, channel, status, created_at, external_ref, contacts(name, email)")
  .eq("studio_id", s.id).eq("channel","email").order("created_at",{ascending:false}).limit(10);
console.log(`email conversations: ${convs?.length ?? 0}`);
for (const c of convs ?? []) {
  console.log(`\n--- ${c.created_at?.slice(0,16)} | ${c.status} | ${c.contacts?.name ?? "?"} <${c.contacts?.email ?? "?"}>`);
  const { data: msgs } = await db.from("messages").select("role, content").eq("conversation_id", c.id).order("created_at").limit(3);
  for (const m of msgs ?? []) {
    console.log(`  [${m.role}] ${String(m.content).slice(0, 400).replace(/\n/g, " ⏎ ")}`);
  }
}
