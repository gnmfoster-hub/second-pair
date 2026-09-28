/**
 * What each business is sold, against what it actually has connected.
 *
 * Giles, 28 Sep: Amber's settings say text messaging is not on her plan when
 * she already has a number. Either channels_allowed is missing 'sms' on her
 * record — in which case the engine has been REFUSING her texts, which is far
 * worse than a wrong sentence on a screen — or the page is reading it wrongly.
 *
 * So: print both sides for every business. Sold, connected, and the gap.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync("C:/Users/gnmfo/Desktop/inkdesk/.env.local", "utf8")
    .split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: studios, error: se } = await db
  .from("studios")
  .select("id, slug, name, channels_allowed")
  .is("archived_at", null)
  .order("slug");
if (se) throw se;

const { data: links, error: le } = await db
  .from("channel_connections")
  .select("studio_id, channel, external_id, active");
if (le) throw le;

/* Messages actually received, per studio per channel — the only proof that
 * matters. A channel with real traffic and no entitlement is the bad case. */
const { data: convs, error: ce } = await db
  .from("conversations")
  .select("studio_id, channel");
if (ce) throw ce;

const seen = new Map();
for (const c of convs ?? []) {
  const k = `${c.studio_id}:${c.channel}`;
  seen.set(k, (seen.get(k) ?? 0) + 1);
}

console.log("studio".padEnd(26), "sold".padEnd(40), "connected / seen");
console.log("-".repeat(100));

for (const s of studios ?? []) {
  const sold = s.channels_allowed ?? ["web"];
  const mine = (links ?? []).filter((l) => l.studio_id === s.id && l.active);
  const connected = [...new Set(mine.map((l) => l.channel))];
  const traffic = [...seen.entries()]
    .filter(([k]) => k.startsWith(`${s.id}:`))
    .map(([k, n]) => `${k.split(":")[1]}×${n}`);

  const gap = connected.filter((c) => !sold.includes(c));
  const trafficGap = traffic
    .map((t) => t.split("×")[0])
    .filter((c) => !sold.includes(c));

  console.log(
    s.slug.padEnd(26),
    (sold.join(",") || "—").padEnd(40),
    `${connected.join(",") || "—"} / ${traffic.join(",") || "—"}`,
  );
  if (gap.length) console.log("   ".padEnd(26), `!! CONNECTED BUT NOT SOLD: ${gap.join(",")}`);
  if (trafficGap.length) console.log("   ".padEnd(26), `!! TRAFFIC BUT NOT SOLD: ${[...new Set(trafficGap)].join(",")}`);
}
