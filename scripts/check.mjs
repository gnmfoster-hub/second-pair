/*
 * Every check, in one command, in the order that fails fastest.
 *
 *   npm run check          the quick ones — about two minutes
 *   npm run check -- --all everything, including the slow screen sweep
 *
 * There are thirteen of these now and nothing else that runs them together, so
 * which ones get run depends on which ones somebody remembers. That is not a
 * theoretical worry: the diary search shipped with a fault that check-find
 * would have caught, because check-find did not exist yet and nothing prompted
 * anybody to wonder what was missing.
 *
 * Ordered so the cheap ones go first. There is no point spending ten minutes
 * looking at two hundred screens if the deploy has not landed yet.
 *
 * Anything that writes is marked and kept out of the quick run. They post real
 * enquiries to a demo business, which is harmless but is not nothing, and they
 * should never be pointed at Living Canvas or Neat & Tidy.
 */
import { spawn } from "node:child_process";

const all = process.argv.includes("--all");

const checks = [
  {
    name: "the deploy landed",
    run: ["node", "scripts/check-live.mjs"],
    quick: true,
  },
  {
    name: "every migration has run",
    run: ["node", "scripts/check-migrations.mjs"],
    quick: true,
  },
  {
    name: "the public pages",
    run: ["node", "scripts/check-public.cjs"],
    quick: true,
  },
  {
    name: "nothing drawn past the edge",
    run: ["node", "scripts/check-edges.cjs"],
    quick: true,
  },
  {
    name: "the diary search behaves",
    run: ["node", "scripts/check-find.cjs"],
    quick: true,
  },
  {
    name: "the reply arrives as it is written",
    run: ["node", "scripts/check-stream.mjs"],
    /** Posts two enquiries to the demo. */
    writes: true,
  },
  {
    name: "how long a customer waits",
    run: ["node", "scripts/check-speed.mjs"],
    /** Posts three enquiries to the demo. */
    writes: true,
  },
  /*
   * A customer books, all the way through to the diary.
   *
   * Every other check looks at a screen or a reply. This one is the only thing
   * that would notice the assistant saying "you're booked in" while nothing
   * was written down, and it has already caught a reminder nobody was getting
   * and a deposit described two contradictory ways.
   *
   * One business, because five in a row spends the whole rate-limit budget for
   * the address and the rest come back refused. Point it at another by hand:
   * node scripts/check-booking.mjs cogs-demo
   */
  {
    name: "a customer books, end to end",
    run: ["node", "scripts/check-booking.mjs", "willow-demo"],
    /** A real enquiry and a real appointment on the demo, both cleared up. */
    writes: true,
  },
  /*
   * And what they do next.
   *
   * Everything above stops at the appointment. Every fault found on the night
   * this was added was past that point — confirming once too often, and asking
   * to cancel — because a script that stops at the booking never asks the
   * things a real person asks next.
   */
  {
    name: "what a customer does after booking",
    run: ["node", "scripts/check-after-booking.mjs", "cogs-demo"],
    /** A real enquiry and appointment on the demo, both cleared up. */
    writes: true,
  },
  /*
   * The consent form, which outlives the appointment.
   *
   * It is the salon's defence if somebody reacts to a colour, so a second
   * submission overwriting the first signature would matter long after
   * anybody had forgotten about it.
   */
  {
    name: "a signature is taken once, and only once",
    run: ["node", "scripts/check-forms.cjs"],
    /** Its own form and its own contact on the demo, both removed after. */
    writes: true,
  },
  /*
   * The afternoons this product exists for.
   *
   * Everything above is a conversation going well. These are somebody out of
   * area, an angry customer, a child, a scalp burnt by yesterday's colour, and
   * a job the business has never done, where the helpful reflex is the wrong
   * one and a slot next Tuesday reads as "this can wait".
   */
  {
    name: "the awkward conversations",
    run: ["node", "scripts/check-awkward.mjs"],
    /** One enquiry per case across five demos, each cleared up after. */
    writes: true,
  },
  /*
   * And the assistant that sells, which nothing checked at all.
   *
   * It is the only one here whose wrong answer costs a customer who never
   * existed, so nobody ever reports it. It was telling prospects it answers
   * WhatsApp and Instagram, of three channels that need Meta's review and are
   * marked "coming shortly" in the dashboard.
   */
  {
    name: "what a prospect is told before they buy",
    run: ["node", "scripts/check-sales.mjs"],
    /** Twelve questions to the support account, cleared up after. */
    writes: true,
  },
  {
    name: "every screen of every business",
    run: ["node", "scripts/check-pages.cjs"],
    /** Ten minutes. */
    slow: true,
  },
];

const chosen = checks.filter((c) => all || c.quick);

/*
 * What this run will spend, said before it spends it.
 *
 * The checks that talk to a demo hold real conversations, and a real
 * conversation costs real money on the Anthropic account. Two full runs in a
 * day is several pounds, which is fine when it is deliberate and is not fine
 * as a habit nobody has priced.
 *
 * Roughly, at about 2p a turn measured over the last month — see
 * scripts/unit-cost.mjs. Deliberately a rough number said out loud rather than
 * a precise one nobody reads.
 */
const TURNS = { stream: 2, speed: 5, booking: 6, after: 6, awkward: 10, sales: 12 };
const spendPence = all
  ? Math.round(Object.values(TURNS).reduce((a, b) => a + b, 0) * 2.1)
  : 0;

console.log(
  all
    ? `Running all ${chosen.length} checks. The last one takes about ten minutes, ` +
        `and the ones that hold real conversations will spend roughly ${spendPence}p of model credit.`
    : `Running the ${chosen.length} quick checks. None of them spends anything. Add --all for the rest.`,
);

/**
 * Runs one and hands back how it went, keeping its output on screen.
 *
 * Three answers, not two. A check that could not run — refused by the rate
 * limit, nothing to measure — has not passed and has not failed, and calling
 * it either is a lie: "failed" sends somebody looking for a bug that is not
 * there, and "passed" is worse. Exit 2 means could not tell.
 */
function runOne(check) {
  return new Promise((resolve) => {
    const [command, ...args] = check.run;
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("close", (code) => resolve(code === 0 ? "passed" : code === 2 ? "unknown" : "failed"));
    child.on("error", () => resolve("failed"));
  });
}

const failed = [];
const unknown = [];

for (const check of chosen) {
  const note = check.writes ? " (writes to the demo)" : check.slow ? " (slow)" : "";
  console.log(`\n─────── ${check.name}${note} ───────`);
  const how = await runOne(check);
  if (how === "failed") failed.push(check.name);
  else if (how === "unknown") unknown.push(check.name);
}

console.log("");

// Said whether anything failed or not: a clean run that could not check
// something has not checked it, and "all passed" would bury that.
if (unknown.length) {
  console.log(`Could not tell either way: ${unknown.join(", ")}. Run again in a few minutes.`);
}

if (failed.length === 0) {
  console.log(
    unknown.length
      ? `The other ${chosen.length - unknown.length} passed.`
      : `All ${chosen.length} passed.`,
  );
  process.exit(unknown.length ? 2 : 0);
}

/*
 * Named rather than counted. "3 failed" sends somebody back up the scrollback
 * through ten minutes of output to find out which three.
 */
console.log(`Failed: ${failed.join(", ")}`);
process.exit(1);
