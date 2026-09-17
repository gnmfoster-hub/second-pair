/**
 * What people have marked as spam, and what our rules made of it.
 *
 *   node scripts/spam-marked.mjs
 *
 * The rules that throw cold pitches out were written by reading five emails.
 * Every conversation somebody marks as spam is a sixth, a seventh, a
 * hundredth — real examples, labelled by the person who actually received
 * them, and they cost nothing to collect because the messages are already
 * stored beside the conversation.
 *
 * This is the other half of that: it takes each marked conversation, runs the
 * first thing they said back through the live rules, and prints the score. A
 * high score means we would have caught it and something else let it through;
 * a zero means the rules have never seen that shape of pitch and there is a
 * sentence in here worth turning into one.
 *
 * Reads only. Prints. Changes nothing.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { coldPitch } from "../src/lib/messaging/coldPitch.ts";

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

const { data: marked, error } = await db
  .from("conversations")
  .select("id, channel, created_at, external_ref, studios(slug)")
  .eq("status", "spam")
  .order("created_at", { ascending: false })
  .limit(200);

if (error) {
  /*
   * Until the migration is run the database has never heard of the value, and
   * asking for it is an error rather than an empty answer. Said plainly: this
   * script is the reason to run it.
   */
  if (/enum conv_status/.test(error.message)) {
    console.log("The database does not know the word yet.");
    console.log("Run supabase/migrations/20260917200000_spam_status.sql, then this again.");
    process.exit(0);
  }
  throw new Error(error.message);
}

if (!marked?.length) {
  console.log("Nobody has marked anything as spam yet.");
  console.log("The option is on a conversation, in the status pill at the top.");
  process.exit(0);
}

console.log(`${marked.length} marked as spam\n`);

let caught = 0;
const missed = [];

for (const conv of marked) {
  const { data: first } = await db
    .from("messages")
    .select("content, created_at")
    .eq("conversation_id", conv.id)
    .eq("role", "client")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!first?.content) continue;

  const verdict = coldPitch(
    { from: conv.external_ref ?? "", subject: "", body: first.content },
    { name: conv.studios?.slug ?? "" },
  );

  const score = verdict.score;
  const why = verdict.signs.join(", ") || "nothing matched";

  if (score > 0) caught++;
  else missed.push({ conv, text: first.content });

  console.log(
    `${(conv.studios?.slug ?? "?").padEnd(26)} ${conv.channel.padEnd(9)} score ${String(score).padStart(2)}  ${why}`,
  );
}

console.log(`\n${caught} of ${marked.length} would score above zero on today's rules.`);

if (missed.length) {
  console.log(`\n${missed.length} that nothing matched — these are the ones worth reading:\n`);
  for (const m of missed.slice(0, 10)) {
    console.log("─".repeat(70));
    console.log(`${m.conv.external_ref ?? "no address"} · ${m.conv.created_at.slice(0, 10)}`);
    console.log(m.text.trim().slice(0, 600));
  }
  console.log("─".repeat(70));
  console.log("\nA rule added from one of these goes in src/lib/messaging/coldPitch.ts,");
  console.log("with the email itself as a test, word for word.");
}
