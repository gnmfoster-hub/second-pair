/*
 * The long dashes in our own two assistants.
 *
 *   node scripts/fix-our-dashes.mjs            say what would change
 *   node scripts/fix-our-dashes.mjs --write    change it
 *
 * The sweep on 15 October found 28 in things a client reads, every one of
 * them in our own `help` and `inside` studios and not one in a client's
 * business. The same sentences appear in both, because `inside` was seeded
 * from the answers already written for owners.
 *
 * Written out one at a time rather than replaced with a rule. A dash does
 * three different jobs in these sentences and the right punctuation differs
 * every time: a full stop where it joins two whole clauses, a colon where it
 * introduces a list or a page name, a comma where what follows is not a
 * sentence. A blind replace produces comma splices, which reads worse than
 * the dash did.
 *
 * Punctuation only. No word is added, removed or reordered, and the one pair
 * of dashes acting as brackets becomes brackets.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

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

const EM = "—";
/*
 * | stands for the dash AND the spaces either side of it.
 *
 * The first version of this used | for the dash alone, so every pattern was
 * missing the space in front of it and not one of the twenty eight matched.
 * The dry run said "0 would change, 28 still carrying one", which is the
 * only reason this is not a script that reported success and did nothing.
 */
const d = (s) => s.replace(/\|/g, " " + EM + " ");
const SWAPS = [
  // The greeting, which is the first thing anybody reads.
  ["Hello|what can I help you with", "Hello. What can I help you with"],

  // The brief the marketing assistant works from.
  ["salon's customer|you are talking", "salon's customer. You are talking"],
  ["they are signed in|so do not", "they are signed in, so do not"],
  ['at the page|"Settings, then Pricing"', 'at the page: "Settings, then Pricing"'],
  ["themselves up|every business is set up", "themselves up. Every business is set up"],
  ["never quote a price|you have no diary", "never quote a price, because you have no diary"],

  // The answers, shared by both.
  ["off a page|it depends on the trade", "off a page. It depends on the trade"],
  ["a plain link instead|put that in your", "a plain link instead. Put that in your"],
  ["answering enquiries|one-person trades", "answering enquiries: one-person trades"],
  [
    "set up with somebody|your prices, your hours, your words, your reminders|because",
    "set up with somebody (your prices, your hours, your words, your reminders) because",
  ],
  ["wrong too|that page is the one", "wrong too. That page is the one"],
  ["claims to be human|that is not a setting", "claims to be human. That is not a setting"],
  ["named after your trade|stylists, artists", "named after your trade: stylists, artists"],
  ["however you normally talk|WhatsApp is fine", "however you normally talk. WhatsApp is fine"],
  ["with a floor|or turn deposits off", "with a floor, or turn deposits off"],
  ["came in on is connected|Settings then Channels", "came in on is connected: Settings then Channels"],
  ["get filled in|leave those alone", "get filled in, so leave those alone"],
  ["in your own words|showing it how you write", "in your own words. Showing it how you write"],
  ["to your home screen|it then behaves", "to your home screen. It then behaves"],
  ["pennies per enquiry|you can see the figure", "pennies per enquiry. You can see the figure"],
  ["which is the point|most enquiries come in", "which is the point. Most enquiries come in"],
].map(([from, to]) => [d(from), to]);

const dashed = /[—–]/;

function mend(text) {
  let out = text;
  for (const [from, to] of SWAPS) out = out.split(from).join(to);
  return out;
}

const { data: studios, error } = await db
  .from("studios")
  .select("id, slug, greeting, tone")
  .in("slug", ["help", "inside"]);
if (error) throw new Error(error.message);

fs.mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });

let changed = 0;
const leftOver = [];

for (const s of studios ?? []) {
  const patch = {};
  for (const column of ["greeting", "tone"]) {
    const was = s[column];
    if (typeof was !== "string" || !dashed.test(was)) continue;
    const now = mend(was);
    if (now === was) {
      leftOver.push(`${s.slug}.${column}`);
      continue;
    }
    patch[column] = now;
    console.log(`\n${s.slug}.${column}`);
    console.log(`  was: ${was.replace(/\s+/g, " ").slice(0, 120)}`);
    console.log(`  now: ${now.replace(/\s+/g, " ").slice(0, 120)}`);
    if (dashed.test(now)) leftOver.push(`${s.slug}.${column} (still has one)`);
    changed++;
  }
  if (WRITE && Object.keys(patch).length) {
    const { error: wrote } = await db.from("studios").update(patch).eq("id", s.id);
    if (wrote) console.log(`  FAILED: ${wrote.message}`);
  }
}

const ids = (studios ?? []).map((s) => s.id);
const { data: faqs } = await db
  .from("faqs")
  .select("id, studio_id, question, answer")
  .in("studio_id", ids);

fs.writeFileSync(
  new URL("../backups/our-answers-before-dashes.json", import.meta.url),
  JSON.stringify({ studios, faqs }, null, 1),
);

for (const f of faqs ?? []) {
  if (!dashed.test(f.answer ?? "")) continue;
  const now = mend(f.answer);
  const slug = studios.find((s) => s.id === f.studio_id)?.slug;

  if (now === f.answer || dashed.test(now)) {
    leftOver.push(`${slug}: ${f.question}`);
    if (now === f.answer) continue;
  }

  console.log(`\n${slug}  ${f.question}`);
  console.log(`  now: ${now.replace(/\s+/g, " ").slice(0, 150)}`);
  changed++;

  if (WRITE) {
    const { error: wrote } = await db.from("faqs").update({ answer: now }).eq("id", f.id);
    if (wrote) console.log(`  FAILED: ${wrote.message}`);
  }
}

console.log(`\n${changed} ${WRITE ? "changed" : "would change"}`);
if (leftOver.length) {
  console.log(`\nStill carrying one, no rule matched:`);
  for (const l of leftOver) console.log(`  ${l}`);
}
