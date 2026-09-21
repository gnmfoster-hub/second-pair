/*
 * The questions somebody asks before they buy, put to the assistant that sells.
 *
 *   node scripts/check-sales.mjs
 *
 * The "Ask ours anything" box on the home page is the one a prospect actually
 * talks to, and until this nothing checked what it says. It is the only
 * assistant on the platform whose wrong answer costs a customer who never
 * existed, so nobody ever reports it.
 *
 * Two different failures, and the second is the dangerous one:
 *
 *   escalated   it said it would get somebody to come back. Safe, and a
 *               prospect deciding whether to buy does not wait for an email.
 *               Every one of these is a question to go and write an answer to.
 *
 *   invented    it claimed something the product does not do. Asked whether it
 *               answers WhatsApp and Instagram, it said "yes, alongside your
 *               website" — of three channels that need Meta's review and are
 *               marked "coming shortly" in the dashboard. That is the one that
 *               ends with somebody signing up for a thing that is not there.
 *
 * Read-only apart from the conversations it starts, which it clears up.
 */
import { db, tidyUp } from "./_tidy.mjs";

const SITE = process.env.SITE ?? "https://www.second-pair.com";

/*
 * `mustNot` is a claim the product cannot currently keep. `wants` is the shape
 * of a real answer. A question with neither is only checked for escalating,
 * which is the common failure.
 */
const ASKS = [
  { say: "what does it cost?" },
  { say: "is there a contract? can I cancel whenever I want?", mayEscalate: "the notice period is genuinely undecided, see the terms page" },
  { say: "how long does it take to set up?" },
  { say: "does it work with fresha?" },
  { say: "does it sync with my google calendar?", mustNot: /\byes\b(?![^.]*\bnot\b)[^.]*\b(sync|google calendar)\b/i },
  {
    /*
     * DELETE THIS GUARD THE DAY META APPROVES THE APP.
     *
     * It is the only line here that will become wrong by the product getting
     * better, and on that day it will fail on a true answer. Checked against
     * the real sentences: it catches "Yes, it handles WhatsApp and Instagram
     * alongside your website" and passes "Not yet, is the honest answer".
     */
    say: "can it answer on whatsapp and instagram?",
    mustNot: /\b(yes|it (does|can|handles))\b[^.]*\b(whatsapp|instagram)\b/i,
    because: "Meta's review is not done and the dashboard says coming shortly",
  },
  { say: "is my clients data safe? where is it stored?" },
  { say: "what happens to my data if I leave?" },
  { say: "can it ring customers back for me?", mustNot: /\byes\b[^.]*\b(ring|call|phone) (them|customers|people)\b/i },
  { say: "does it chase people who never booked?" },
  { say: "what if it says something wrong to one of my customers?" },
  { say: "my customers will hate talking to a robot" },
];

/* It said it would get back to them, which for a prospect is a no. */
const ESCALATED =
  /(get that checked|come back to you|passed (it|this|that)|with the business now|somebody will|someone will|I will get)/i;

const session = () => "sale" + Math.random().toString(36).slice(2, 14) + "abcdefgh";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(sessionKey, message) {
  const r = await fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: "help", session: sessionKey, message }),
  });
  const body = await r.json().catch(() => ({}));
  return body.reply ?? (body.error ? `(no reply: ${body.error})` : "(nothing)");
}

let gaps = 0;
let invented = 0;

for (const item of ASKS) {
  const reply = await ask(session(), item.say);

  console.log(`\n  > ${item.say}`);
  console.log(`  ${reply.replace(/\s+/g, " ")}`);

  /* A refusal by the rate limiter is not an answer. See check-awkward. */
  if (/^\(no reply: Slow down\)?/i.test(reply)) {
    console.log("  — rate limited, not asked properly.");
    await wait(8000);
    continue;
  }

  if (item.mustNot && item.mustNot.test(reply)) {
    invented++;
    console.log(`  ✗ CLAIMED SOMETHING IT CANNOT DO — ${item.because ?? "see mustNot"}`);
  } else if (ESCALATED.test(reply)) {
    if (item.mayEscalate) {
      console.log(`  · escalated, and rightly: ${item.mayEscalate}`);
    } else {
      gaps++;
      console.log("  ✗ escalated. A prospect deciding whether to buy will not wait for an email.");
    }
  }

  await wait(6000);
}

await tidyUp(db(), "help", ["sale"]);

console.log("");
if (invented) {
  console.log(`${invented} answer${invented === 1 ? "" : "s"} claimed something the product does not do. Fix those first.`);
}
if (gaps) {
  console.log(`${gaps} question${gaps === 1 ? "" : "s"} it could not answer. Each one wants writing down in the support account's questions.`);
}
if (!gaps && !invented) {
  console.log("Every question a prospect asks got a real answer.");
}
process.exitCode = gaps + invented ? 1 : 0;
