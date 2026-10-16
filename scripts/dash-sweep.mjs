/*
 * Every long dash left in anything a customer reads.
 *
 *   node scripts/dash-sweep.mjs
 *
 * The reminder templates were swept on 15 October. This is everything else
 * the assistant says or shows: greetings, the things it is told to always
 * mention, the answers it is allowed to give, service names, voice examples.
 *
 * Reports only. Nothing here is anybody's to rewrite without asking, and two
 * of these studios are deliberately not to be touched.
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

const dashed = /[—–]/;
const flat = (v) => String(v ?? "").replace(/\s+/g, " ");

const { data: studios } = await db.from("studios").select("*").order("name");
const by = new Map((studios ?? []).map((s) => [s.id, s]));

let found = 0;
const say = (who, what, text) => {
  found++;
  console.log(`\n${who}  ${what}`);
  console.log(`  ${flat(text).slice(0, 170)}`);
};

/* What the studio itself says. */
for (const s of studios ?? []) {
  for (const column of ["greeting", "tone", "cancellation_policy", "widget_teaser", "widget_line_open", "widget_line_closed"]) {
    const v = s[column];
    if (typeof v === "string" && dashed.test(v)) say(`${s.slug}`, column, v);
  }
  for (const column of ["always_mention", "voice_examples", "never_say"]) {
    const v = s[column];
    if (Array.isArray(v)) {
      for (const line of v) if (typeof line === "string" && dashed.test(line)) say(`${s.slug}`, column, line);
    }
  }
}

/* And the tables behind it. */
for (const [table, columns] of [
  ["faqs", ["question", "answer"]],
  ["services", ["name", "description"]],
  ["price_bands", ["size_label", "note"]],
]) {
  const { data, error } = await db.from(table).select("*");
  if (error) {
    console.log(`\ncould not read ${table}: ${error.message}`);
    continue;
  }
  for (const row of data ?? []) {
    const s = by.get(row.studio_id);
    for (const c of columns) {
      if (typeof row[c] === "string" && dashed.test(row[c])) {
        say(`${s?.slug ?? row.studio_id}`, `${table}.${c}`, row[c]);
      }
    }
  }
}

console.log(`\n${found} long dashes in things a customer or a client reads.`);
