/*
 * Hold a real conversation with every demo and read what it says back.
 *
 *   node scripts/check-answers.mjs [business-slug]
 *
 * Everything else here checks that a page renders, a column exists, a reply
 * arrives. None of that catches the faults Giles actually finds, because those
 * are not crashes — they are sentences. A business quoting "£0 to £0" and being
 * told to say it with confidence. A business with no hours telling customers it
 * was fully booked for three weeks. An assistant narrating "no need for tools
 * here" into the middle of a message and sending it.
 *
 * Nothing threw. Nothing was logged. The only symptom in every case was a
 * person reading a reply and thinking that looks wrong.
 *
 * So this asks, and reads the answers against rules that say what they object
 * to — see lib/engine/neverSay. It writes real enquiries to a demo's inbox and
 * clears them up afterwards, so it never goes near a live business.
 */
import { db, tidyUp } from "./_tidy.mjs";
import { neverSay } from "../src/lib/engine/neverSay.ts";

const SITE = process.env.SITE ?? "https://www.second-pair.com";

/*
 * Three questions every trade gets, in the customer's own words.
 *
 * Deliberately the awkward ones: a price before anything is known, a time
 * before a name is given, and something the business almost certainly does not
 * do. The polite middle of a conversation is not where this goes wrong.
 */
const ASKS = [
  "hi, how much do you charge?",
  "what have you got free this week?",
  "do you do anything on a Sunday?",
];

const DEMOS = ["willow-demo", "pawfect-demo", "cogs-demo", "ashcroft-demo", "dansdriving-demo"];

const session = () => "answ" + Math.random().toString(36).slice(2, 14) + "abcdefgh";

async function ask(slug, sessionKey, message) {
  const r = await fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: slug, session: sessionKey, message }),
  });
  const body = await r.json().catch(() => ({}));
  return body.reply ?? (body.error ? `(no reply: ${body.error})` : "(nothing)");
}

const only = process.argv[2];
const businesses = only ? [only] : DEMOS;
let faults = 0;

for (const slug of businesses) {
  console.log(`\n───────── ${slug} ─────────`);
  const key = session();

  for (const question of ASKS) {
    const reply = await ask(slug, key, question);
    const slips = neverSay(reply);

    console.log(`\n  > ${question}`);
    console.log(`  ${reply.replace(/\s+/g, " ").slice(0, 300)}`);

    for (const slip of slips) {
      faults++;
      console.log(`  ✗ ${slip.what} — "${slip.saying}"`);
    }
  }

  await tidyUp(db(), slug, ["answ"]);
}

console.log(
  faults
    ? `\n${faults} thing${faults > 1 ? "s" : ""} said that should not have been.`
    : "\nNothing said that should not have been.",
);
process.exitCode = faults ? 1 : 0;
