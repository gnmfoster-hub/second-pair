/**
 * What a business actually costs to run, measured rather than guessed.
 *
 * Read-only. Every assistant reply already records what the model charged for
 * that turn, so the AI half is real money, not an estimate. The rest is
 * counted — texts sent, emails sent, conversations, appointments — and priced
 * at the rates in RATES below, which are the only numbers here anybody has to
 * keep up to date.
 *
 * Run: node scripts/what-it-costs.mjs [days]
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

/** Pence, unless it says otherwise. Checked 16 September 2026. */
const RATES = {
  // Twilio UK: outbound long-code SMS, per 160-character segment.
  smsOut: 4.0,
  smsIn: 0.75,
  numberPerMonth: 100,
  // Resend: 3,000 free a month then $20 for 50,000 — a hundredth of a penny.
  email: 0.03,
  // Shared, per business, at the plans we are on. Vercel Pro $20, Supabase Pro
  // $25, the domain and the mailbox. Divided by however many businesses there
  // are, which is the honest way to show it while there are so few.
  sharedPerMonth: 4500,
};

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86400_000).toISOString();
const money = (pence) => `£${(pence / 100).toFixed(2)}`;

const { data: studios } = await db.from("studios").select("id, name, kind, archived_at");
const live = (studios ?? []).filter((s) => s.kind !== "demo" && !s.archived_at);

console.log(`\nWhat it costs, last ${days} days — ${live.length} live businesses\n${"=".repeat(64)}`);

let totalAi = 0;
let totalTexts = 0;

for (const studio of live) {
  const { data: convos } = await db
    .from("conversations")
    .select("id, channel, is_test")
    .eq("studio_id", studio.id);

  const ids = (convos ?? []).filter((c) => !c.is_test).map((c) => c.id);
  const channelOf = new Map((convos ?? []).map((c) => [c.id, c.channel]));

  let ai = 0;
  let replies = 0;
  let inbound = 0;
  let textsOut = 0;
  let textsIn = 0;
  let emailsOut = 0;

  for (let i = 0; i < ids.length; i += 50) {
    const { data: msgs } = await db
      .from("messages")
      .select("conversation_id, role, usage, created_at")
      .in("conversation_id", ids.slice(i, i + 50))
      .gte("created_at", since);

    for (const m of msgs ?? []) {
      const channel = channelOf.get(m.conversation_id) ?? "web";
      ai += m.usage?.cost_micros ?? 0;
      if (m.role === "client") {
        inbound++;
        if (channel === "sms") textsIn++;
      }
      if (m.role === "assistant" || m.role === "owner") {
        replies++;
        if (channel === "sms") textsOut++;
        if (channel === "email") emailsOut++;
      }
    }
  }

  // Through the booking: a reminder has no studio of its own.
  const { count: remindersSent, error: remindersError } = await db
    .from("reminders")
    .select("id, bookings!inner(artists!inner(studio_id))", { count: "exact", head: true })
    .eq("bookings.artists.studio_id", studio.id)
    .eq("status", "sent")
    .gte("created_at", since);

  if (remindersError) console.error("  (reminders could not be counted:", remindersError.message + ")");

  // A reminder goes by text where there is a number, and email otherwise. The
  // split is not recorded, so it counts as a text — the dearer of the two.
  const smsTotal = textsOut + (remindersSent ?? 0);

  const aiPence = ai / 10_000; // micros of a pound → pence
  const smsPence = smsTotal * RATES.smsOut + textsIn * RATES.smsIn;
  const emailPence = emailsOut * RATES.email;
  const run = aiPence + smsPence + emailPence + RATES.numberPerMonth;

  totalAi += aiPence;
  totalTexts += smsTotal;

  console.log(`\n${studio.name}`);
  console.log(`  ${inbound} messages in, ${replies} replies out`);
  console.log(`  the model            ${money(aiPence).padStart(9)}   (${replies ? money(aiPence / replies) : "—"} a reply)`);
  console.log(`  texts                ${money(smsPence).padStart(9)}   (${smsTotal} out, ${textsIn} in)`);
  console.log(`  email                ${money(emailPence).padStart(9)}   (${emailsOut} sent)`);
  console.log(`  their phone number   ${money(RATES.numberPerMonth).padStart(9)}   a month`);
  console.log(`  ─────────────────────${"─".repeat(9)}`);
  console.log(`  what they cost us    ${money(run).padStart(9)}   before anything shared`);
  console.log(`  plus a share of      ${money(RATES.sharedPerMonth / Math.max(1, live.length)).padStart(9)}   hosting, database, domain, mailbox`);
  console.log(`  ALL IN               ${money(run + RATES.sharedPerMonth / Math.max(1, live.length)).padStart(9)}`);
}

console.log(`\n${"=".repeat(64)}`);
console.log(`The model, everything: ${money(totalAi)} over ${days} days`);
console.log(`Texts, everything: ${totalTexts}`);
console.log(
  `\nRates used: ${RATES.smsOut}p a text out, ${RATES.smsIn}p in, ${money(RATES.numberPerMonth)} a number,` +
    ` ${RATES.email}p an email, ${money(RATES.sharedPerMonth)} a month shared.`,
);
