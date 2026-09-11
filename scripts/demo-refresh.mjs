/**
 * Make the demo salon current again, from a terminal.
 *
 *   node scripts/demo-refresh.mjs
 *
 * The work is in src/lib/demo/refresh.ts so the back office can run exactly
 * the same thing from a button — before this, freshening the demo needed a
 * checkout and the service key, which meant in practice it happened when
 * somebody was at their desk rather than before it was shown to anybody.
 *
 * Creates nothing. scripts/demo-salon.mjs builds the studio, its people and
 * its regulars; this replaces what goes stale.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { refreshDemo } from "../src/lib/demo/refresh.ts";

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

const SLUG = "willow-demo";

const { data: studio } = await db
  .from("studios")
  .select("id")
  .eq("slug", SLUG)
  .maybeSingle();

if (!studio) {
  console.error(`No studio "${SLUG}". Run scripts/demo-salon.mjs first.`);
  process.exit(1);
}

const out = await refreshDemo(db, studio.id);
console.log(
  `${out.appointments} appointments, ${out.conversations} conversations and ${out.messages} messages for ${SLUG}.`,
);
