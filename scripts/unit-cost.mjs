/**
 * What one conversation costs, in detail.
 *
 * Read-only. The per-reply figure is the one that decides a subscription
 * price, and it is measured: every assistant turn records what the model
 * charged for it, including what was cached and what was not.
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

const days = Number(process.argv[2] ?? 60);
const since = new Date(Date.now() - days * 86400_000).toISOString();

const { data: msgs } = await db
  .from("messages")
  .select("conversation_id, role, usage, created_at")
  .eq("role", "assistant")
  .gte("created_at", since)
  .not("usage", "is", null)
  .limit(5000);

const replies = (msgs ?? []).filter((m) => (m.usage?.cost_micros ?? 0) > 0);
if (!replies.length) {
  console.log("Nothing measured in that window.");
  process.exit(0);
}

const sum = (f) => replies.reduce((t, m) => t + (f(m.usage) ?? 0), 0);
const micros = sum((u) => u.cost_micros);
const input = sum((u) => u.input);
const output = sum((u) => u.output);
const cacheRead = sum((u) => u.cache_read);
const cacheWrite = sum((u) => u.cache_write);

const byConv = new Map();
for (const m of replies) {
  byConv.set(m.conversation_id, (byConv.get(m.conversation_id) ?? 0) + (m.usage?.cost_micros ?? 0));
}

const perConv = [...byConv.values()].sort((a, b) => a - b);
const median = perConv[Math.floor(perConv.length / 2)];
const dearest = perConv[perConv.length - 1];

const p = (m) => `£${(m / 1_000_000).toFixed(4)}`;

console.log(`\nMeasured over ${days} days: ${replies.length} replies across ${byConv.size} conversations\n`);
console.log(`  a reply, on average        ${p(micros / replies.length)}`);
console.log(`  a conversation, middle     ${p(median)}`);
console.log(`  a conversation, the worst  ${p(dearest)}`);
console.log(`  replies per conversation   ${(replies.length / byConv.size).toFixed(1)}`);
console.log(`\nTokens per reply, on average`);
console.log(`  fresh input   ${Math.round(input / replies.length).toLocaleString()}`);
console.log(`  read from cache ${Math.round(cacheRead / replies.length).toLocaleString()}`);
console.log(`  written to cache ${Math.round(cacheWrite / replies.length).toLocaleString()}`);
console.log(`  written out   ${Math.round(output / replies.length).toLocaleString()}`);
console.log(
  `\nCaching is saving about ${(((cacheRead * 0.9) / (input + cacheRead + cacheWrite)) * 100).toFixed(0)}% of what the input would otherwise cost.`,
);

// What a month looks like at three sizes, on those measured numbers.
const perReply = micros / replies.length / 1_000_000; // pounds
const perConversation = median / 1_000_000;
const shapes = [
  { name: "Quiet — 20 enquiries a month, 60 appointments", enquiries: 20, reminders: 60 },
  { name: "Typical salon — 80 enquiries, 200 appointments", enquiries: 80, reminders: 200 },
  { name: "Busy — 200 enquiries, 500 appointments", enquiries: 200, reminders: 500 },
];

console.log(`\nA month, on those figures (texts at 4p, a number at £1)\n${"─".repeat(60)}`);
for (const s of shapes) {
  const model = s.enquiries * perConversation;
  // A reminder is one text; half of enquiries arrive by text and get answered there.
  const texts = s.reminders + s.enquiries * 0.5 * (replies.length / byConv.size);
  const textCost = (texts * 4) / 100;
  const total = model + textCost + 1;
  console.log(`${s.name}`);
  console.log(
    `   model £${model.toFixed(2)} + texts £${textCost.toFixed(2)} (${Math.round(texts)}) + number £1.00  =  £${total.toFixed(2)} a month`,
  );
}
