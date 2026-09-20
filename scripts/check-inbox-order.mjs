/**
 * Threads sitting lower down the inbox than they should.
 *
 *   node scripts/check-inbox-order.mjs
 *
 * The inbox is ordered by conversations.last_message_at, and until the trigger
 * in 20260920200000 that field was kept by hand in twenty different files. Miss
 * it once and there is no symptom to notice: the message is saved, the thread
 * shows it when opened, and the only sign is the thread sitting below a week of
 * older ones. Which is exactly how Giles rang the live number, got the text
 * back, and could not find the call.
 *
 * So the question is asked directly instead. Any thread whose newest message is
 * newer than its stamp is one somebody would have to scroll for.
 *
 * Run it after the migration to confirm the backfill took, and any time the
 * inbox looks like it is missing something.
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

const { data: studios } = await db.from("studios").select("id, name");
const nameOf = new Map((studios ?? []).map((s) => [s.id, s.name]));

/*
 * Paged, because both of these outgrow a default limit long before anybody
 * notices, and a check that silently stops reading at a thousand rows reports a
 * clean platform for the half of it that it looked at.
 */
async function all(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

const conversations = await all("conversations", "id, studio_id, last_message_at");
const messages = await all("messages", "conversation_id, created_at");

const newest = new Map();
for (const m of messages) {
  const seen = newest.get(m.conversation_id);
  if (!seen || m.created_at > seen) newest.set(m.conversation_id, m.created_at);
}

/*
 * A second is not a fault.
 *
 * Insert then update is two statements, so a thread written the honest way is
 * routinely a few hundred milliseconds behind its own newest message. What
 * matters is a thread that is behind by long enough to change where it sits in
 * a list, which is minutes at the very least.
 */
const MATTERS_MS = 60_000;

const stale = [];
for (const c of conversations) {
  const last = newest.get(c.id);
  if (!last) continue;
  const behind = Date.parse(last) - Date.parse(c.last_message_at);
  if (behind > MATTERS_MS) stale.push({ ...c, last, behind });
}

stale.sort((a, b) => b.behind - a.behind);

const hours = (ms) => {
  const h = ms / 3_600_000;
  return h >= 48 ? `${Math.round(h / 24)} days` : `${Math.round(h)} hours`;
};

console.log("");
if (!stale.length) {
  console.log(`Every thread is where it should be in the inbox. ${conversations.length} checked.`);
} else {
  console.log(`${stale.length} thread${stale.length === 1 ? "" : "s"} sitting lower than they should:`);
  for (const s of stale) {
    console.log(
      `    ${nameOf.get(s.studio_id) ?? s.studio_id} — ${s.id.slice(0, 8)} is ${hours(s.behind)} behind its newest message`,
    );
  }
  console.log("\n  Somebody would have to scroll past older conversations to find these.");
  console.log("  If the trigger in 20260920200000 has been run, this should be empty.");
  process.exitCode = 1;
}
