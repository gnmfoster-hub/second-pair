/**
 * Puts a handful of real conversations through a studio, so the inbox, the
 * client list and the conversation view can be judged against something that
 * looks like a working week rather than an empty state.
 *
 *   node scripts/demo-enquiries.mjs "Test Salon"
 *
 * These are genuine calls to the assistant, so they cost what a real enquiry
 * costs — about eleven pence each.
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

const BASE = process.env.BASE ?? "http://localhost:3000";
const name = process.argv[2] ?? "Test Salon";

const { data: studio } = await db
  .from("studios")
  .select("id, slug, privacy_notice_url")
  .eq("name", name)
  .single();
if (!studio) throw new Error(`No studio called "${name}"`);

// The assistant opens with a privacy line, which needs somewhere to point.
if (!studio.privacy_notice_url) {
  await db
    .from("studios")
    .update({ privacy_notice_url: "https://second-pair.com/privacy" })
    .eq("id", studio.id);
}

/** A believable spread: priced, booked, escalated, and one still mid-flow. */
const CONVERSATIONS = [
  [
    "hiya, how much for a full head of highlights? never been before",
    "im Beth, 07700 900412. how about thursday?",
  ],
  [
    "hi do you do balayage? my hair is quite dark",
    "Amara. whats the earliest you could do?",
  ],
  [
    "im really not happy, i was in last week and the colour has gone orange",
  ],
  [
    "hi, whats the price for a cut and finish please",
  ],
  [
    "hello — do you do wedding hair? its for september next year",
    "Nia, and its me and four bridesmaids",
  ],
];

const say = async (session, message) => {
  const response = await fetch(`${BASE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: studio.slug, session, message }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  return data;
};

const stamp = Date.now().toString(36);

for (const [index, turns] of CONVERSATIONS.entries()) {
  const session = `demo${stamp}${index}`.padEnd(20, "0").slice(0, 32);
  console.log(`\n${index + 1}. ${turns[0]}`);

  for (const turn of turns) {
    const result = await say(session, turn);
    const reply = (result.reply ?? "(handed over — assistant silent)").split("\n").pop();
    console.log(`   → ${reply.slice(0, 110)}`);
  }
}

console.log(`\nDone. ${CONVERSATIONS.length} conversations in ${name}'s inbox.`);
