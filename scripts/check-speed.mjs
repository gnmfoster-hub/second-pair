/*
 * How long a customer waits, and which part of it they are waiting for.
 *
 *   node scripts/check-speed.mjs [business-slug]
 *
 * Web chat is the only channel where somebody is sitting watching — an email
 * or a text can take twenty seconds and nobody notices. So this asks a real
 * business three real questions through the live widget endpoint and reports
 * the wait, split by what the server says it spent it on.
 *
 * The point of the split is to stop us fixing the wrong thing. Streaming the
 * reply so words appear as they are written is a fair amount of work on a path
 * two paying businesses depend on, and it is only the right answer if the wait
 * is the model writing. If it is database round trips, or tools running one
 * after another that could run together, streaming would hide a problem that
 * could have been removed instead.
 *
 * Writes nothing a business would see: the questions go in as an ordinary web
 * session, which lands in the demo's inbox like any other enquiry, so point it
 * at a demo rather than at Living Canvas or Neat & Tidy.
 */
const SITE = process.env.SITE ?? "https://www.second-pair.com";
const slug = process.argv[2] ?? "brightwork-demo";
const session = "speed" + Math.random().toString(36).slice(2, 14) + "abcdefgh";

const asks = [
  "hi, do you do ceiling skimming?",
  "how much would one room be?",
  "what have you got free next week?",
];

/** `setup;dur=210, model;dur=6100` → { setup: 210, model: 6100 } */
function readTiming(header) {
  const out = {};
  for (const part of (header ?? "").split(",")) {
    const m = part.trim().match(/^([a-z]+);dur=(\d+(?:\.\d+)?)$/i);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

const bar = (ms, worst) => "█".repeat(Math.max(0, Math.round((ms / worst) * 28)));

const totals = { setup: 0, model: 0, tools: 0, save: 0 };
let rounds = 0;
let wall = 0;

for (const message of asks) {
  const began = Date.now();
  const r = await fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: slug, session, message }),
  });
  const took = Date.now() - began;
  const body = await r.json().catch(() => ({}));
  const spent = readTiming(r.headers.get("server-timing"));

  wall += took;
  rounds += spent.rounds ?? 0;
  for (const k of Object.keys(totals)) totals[k] += spent[k] ?? 0;

  const split = Object.entries(spent)
    .filter(([k]) => k !== "rounds")
    .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`)
    .join("  ");

  console.log(`${(took / 1000).toFixed(1)}s  ${message}`);
  console.log(`      ${split || "(no timing header — is the build current?)"}`);
  if (!body.reply && !body.paused) console.log(`      no reply: ${body.error ?? "?"}`);
}

const n = asks.length;
console.log(`\nAverage wait ${(wall / n / 1000).toFixed(1)}s over ${n} questions.`);

if (!totals.model) {
  console.log("No server timing came back. Nothing to take apart.");
  process.exit(0);
}

const worst = Math.max(...Object.values(totals));
console.log("\nWhere it went, added up across all three:");
for (const [name, ms] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  const share = Math.round((ms / Object.values(totals).reduce((a, b) => a + b, 0)) * 100);
  console.log(`  ${name.padEnd(6)} ${(ms / 1000).toFixed(1).padStart(5)}s  ${String(share).padStart(3)}%  ${bar(ms, worst)}`);
}
console.log(`\n${rounds} rounds of the model across ${n} replies.`);

/*
 * The conclusion, said out loud, so it does not have to be re-derived from the
 * bars every time somebody runs this.
 */
const share = (k) => totals[k] / Object.values(totals).reduce((a, b) => a + b, 0);
if (share("model") > 0.7) {
  console.log("Most of the wait is the model writing. Streaming is the fix.");
} else if (share("tools") > 0.25) {
  console.log("A quarter of it or more is tools. Look at running them together first.");
} else if (share("setup") + share("save") > 0.35) {
  console.log("A third of it is database work either side. Look there before streaming.");
}
