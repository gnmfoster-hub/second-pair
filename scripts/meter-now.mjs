/** Count this month now, rather than waiting for tonight's job. */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { meterThisMonth } from "../src/lib/meter.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(await meterThisMonth(db));

const { data } = await db.from("usage_months").select("*");
for (const row of data ?? []) {
  const { data: s } = await db.from("studios").select("name").eq("id", row.studio_id).single();
  console.log(
    `${s?.name}: ${row.texts_out} texts out, ${row.texts_in} in, ${row.emails_out} emails, ` +
      `£${(row.model_micros / 1_000_000).toFixed(4)} model, plan £${(row.plan_pence / 100).toFixed(2)}`,
  );
}
