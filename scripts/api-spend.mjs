/*
 * What the Anthropic bill is actually made of.
 *
 *   node scripts/api-spend.mjs [days]
 *
 * Every other cost report here answers a different question: what a business
 * costs to serve. Both of them read messages.usage and both exclude rehearsals,
 * which is right for a business and wrong for an invoice.
 *
 * messages.usage is deleted with its conversation, and the checks in this
 * folder write real enquiries to a demo and clear them up afterwards. So the
 * platform reported £2.14 of model spend for a month while the credit ran down,
 * and both figures were honest: nine tenths of the spend had been tidied away
 * by the thing that made it.
 *
 * model_spend is the durable half. One row per turn, kept whatever happens to
 * the conversation, and never filtered for being a test.
 *
 * Read-only.
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

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86400_000).toISOString();

const { data: rows, error } = await db
  .from("model_spend")
  .select("at, studio_slug, channel, is_test, cost_micros, rounds")
  .gte("at", since)
  .order("at", { ascending: false })
  .limit(50000);

if (error) {
  console.log(
    `\nNo record to read yet: ${error.message}\n\n` +
      "Run supabase/migrations/20260921120000_model_spend.sql and this starts\n" +
      "filling from the next reply onwards. It cannot say anything about spend\n" +
      "that happened before it existed, which is the whole reason it exists.",
  );
  process.exit(1);
}

const money = (micros) => `£${(micros / 1e6).toFixed(2)}`;
const all = rows ?? [];

if (!all.length) {
  console.log(`\nNothing recorded in the last ${days} days.`);
  process.exit(0);
}

const total = all.reduce((t, r) => t + r.cost_micros, 0);
const tests = all.filter((r) => r.is_test);
const real = all.filter((r) => !r.is_test);
const testTotal = tests.reduce((t, r) => t + r.cost_micros, 0);

console.log(`\nModel spend, last ${days} days — ${money(total)} over ${all.length} turns`);
console.log("=".repeat(64));

/* The split that answers "is this me or is this customers". */
console.log(`  customers      ${money(total - testTotal)}  (${real.length} turns)`);
console.log(`  tests and me   ${money(testTotal)}  (${tests.length} turns)`);

const byStudio = new Map();
for (const r of all) {
  const key = r.studio_slug ?? "(unknown)";
  const row = byStudio.get(key) ?? { micros: 0, turns: 0, test: 0 };
  row.micros += r.cost_micros;
  row.turns += 1;
  if (r.is_test) row.test += r.cost_micros;
  byStudio.set(key, row);
}

console.log("\nBy business");
console.log("-".repeat(64));
for (const [slug, row] of [...byStudio].sort((a, b) => b[1].micros - a[1].micros)) {
  const note = row.test ? `, of which ${money(row.test)} tests` : "";
  console.log(`  ${slug.padEnd(28)} ${money(row.micros).padStart(8)}  ${row.turns} turns${note}`);
}

const byDay = new Map();
for (const r of all) {
  const day = r.at.slice(0, 10);
  byDay.set(day, (byDay.get(day) ?? 0) + r.cost_micros);
}

console.log("\nBy day");
console.log("-".repeat(64));
for (const [day, micros] of [...byDay].sort()) {
  console.log(`  ${day}  ${money(micros).padStart(8)}`);
}

/*
 * The dear ones, because a turn that goes round the model eight times costs
 * several times one that answers straight off, and that is the difference
 * worth seeing rather than an average that hides it.
 */
const dear = [...all].sort((a, b) => b.cost_micros - a.cost_micros).slice(0, 5);
console.log("\nThe dearest single turns");
console.log("-".repeat(64));
for (const r of dear) {
  console.log(
    `  ${money(r.cost_micros).padStart(8)}  ${r.at.slice(0, 16)}  ${r.studio_slug ?? "?"}  ${r.rounds} rounds${r.is_test ? "  (test)" : ""}`,
  );
}

const perTurn = total / all.length / 1e6;
console.log(`\nA turn costs £${perTurn.toFixed(4)} on average.`);
if (testTotal > total / 2) {
  console.log(
    "More than half of this is testing rather than customers, which is what you\n" +
      "would expect while the product is being built and is exactly the part every\n" +
      "other report here leaves out.",
  );
}
