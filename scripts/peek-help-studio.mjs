/*
 * What the help studio actually is in the database.
 *
 *   node scripts/peek-help-studio.mjs
 *
 * It is the internal assistant that helps a client work the product, and it
 * has been set up as though it were a business that takes bookings. Before
 * changing that, this says exactly what it is carrying: services, diary,
 * reminders, prices, hours, and whatever the prompt is reading.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
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

const { data: studio } = await db.from("studios").select("*").eq("slug", "help").maybeSingle();
if (!studio) throw new Error("no studio with the slug help");

const interesting = [
  "id", "name", "slug", "kind", "vertical", "timezone", "archived_at",
  "greeting", "tone", "always_mention", "booking_mode", "deposit_policy",
  "message_channels", "weekly_report_email", "daily_brief_email",
  "logo_url", "avatar_url", "brand_colour", "accent", "website",
];
for (const k of interesting) {
  if (k in studio) console.log(`${k}: ${JSON.stringify(studio[k])}`);
}

console.log("\nevery other column that is set:");
for (const [k, v] of Object.entries(studio)) {
  if (interesting.includes(k)) continue;
  if (v === null || v === false || v === "" || (Array.isArray(v) && !v.length)) continue;
  console.log(`  ${k}: ${JSON.stringify(v).slice(0, 160)}`);
}

for (const [table, column] of [
  ["artists", "studio_id"],
  ["services", "studio_id"],
  ["price_bands", "studio_id"],
  ["faqs", "studio_id"],
  ["reminder_templates", "studio_id"],
  ["contacts", "studio_id"],
]) {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, studio.id);
  console.log(`\n${table}: ${error ? `could not read (${error.message})` : count}`);
}

const { data: faqs } = await db.from("faqs").select("question, answer").eq("studio_id", studio.id);
for (const f of faqs ?? []) {
  console.log(`  FAQ: ${f.question}\n       ${String(f.answer).replace(/\s+/g, " ").slice(0, 160)}`);
}

const { data: services } = await db
  .from("services")
  .select("name, minutes, price_pence, bookable_online")
  .eq("studio_id", studio.id);
for (const s of services ?? []) console.log(`  SERVICE: ${JSON.stringify(s)}`);
