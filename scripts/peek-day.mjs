/*
 * The raw rows behind one day, to check a brief against.
 *
 *   node scripts/peek-day.mjs <slug> <yyyy-mm-dd>
 *
 * Exists because the brief showed no phone numbers and "the data has none"
 * and "the query asked wrongly" look identical from the outside.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const slug = process.argv[2] ?? "amber-s-paws-pastures";
const day = process.argv[3] ?? new Date().toISOString().slice(0, 10);

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

const { data: studio } = await db.from("studios").select("id, name").eq("slug", slug).maybeSingle();
const { data: people } = await db.from("artists").select("id, name").eq("studio_id", studio.id);

const { data: rows } = await db
  .from("bookings")
  .select("id, starts_at, title, price_pence, notes, contact_id, artist_id")
  .in("artist_id", people.map((p) => p.id))
  .is("cancelled_at", null)
  .gte("starts_at", `${day}T00:00:00Z`)
  .lt("starts_at", `${day}T23:59:59Z`)
  .order("starts_at");

for (const b of rows ?? []) {
  let contact = null;
  if (b.contact_id) {
    const { data } = await db
      .from("contacts")
      .select("name, phone, email")
      .eq("id", b.contact_id)
      .maybeSingle();
    contact = data;
  }
  console.log({ starts: b.starts_at, title: b.title, price: b.price_pence, notes: b.notes, contact });
}
