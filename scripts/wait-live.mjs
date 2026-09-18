/*
 * Wait until what is live is what you pushed, and say so loudly either way.
 *
 *   node scripts/wait-live.mjs [minutes]
 *
 * Written after getting it wrong. The wait was a shell loop that tried a
 * fixed number of times and then simply stopped — no line printed, nothing
 * non-zero, the next command in the chain running as if the deploy had
 * landed. So a screenshot was taken of a build two commits old, read as
 * proof that a fix had not worked, and a good half hour went into looking
 * for a bug in code that was never running.
 *
 * A wait that gives up silently is worse than no wait at all: without it
 * you know you have not checked. So this prints every attempt, exits 0 only
 * when the commit matches, and exits 1 with the two shas side by side if it
 * runs out of patience.
 *
 * Six minutes is normal for this project, so the default allows fifteen.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const minutes = Number(process.argv[2] ?? 15);
const SITE = process.env.SITE ?? "https://www.second-pair.com";

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

const mine = execSync("git rev-parse --short HEAD").toString().trim();

async function live() {
  try {
    const r = await fetch(
      `${SITE}/api/health?deep=1&key=${encodeURIComponent(env.CRON_SECRET ?? "")}`,
    );
    return (await r.json())?.deployment?.commit ?? null;
  } catch {
    return null;
  }
}

const every = 20_000;
const tries = Math.ceil((minutes * 60_000) / every);
const began = Date.now();

console.log(`Waiting for ${mine} to go live, up to ${minutes} minutes.`);

/*
 * Setting exitCode rather than calling process.exit.
 *
 * Exiting hard while a fetch is still holding a socket trips an assertion
 * inside libuv on Windows and the script dies with 127 having done its job
 * perfectly — which would make this, of all things, a check that lies about
 * whether it worked.
 */
let done = false;
for (let i = 1; i <= tries && !done; i++) {
  const there = await live();
  const mins = ((Date.now() - began) / 60_000).toFixed(1);

  if (there === mine) {
    console.log(`${mine} is live after ${mins} minutes.`);
    process.exitCode = 0;
    done = true;
    break;
  }

  // Quiet in the middle, so a long wait does not bury what came before it.
  if (i <= 2 || i % 3 === 0) {
    console.log(`  ${mins}m — live is ${there ?? "unreachable"}, waiting for ${mine}`);
  }

  await new Promise((r) => setTimeout(r, every));
}

if (!done) {
  console.log(
    `\nGave up after ${minutes} minutes. Live is still ${await live()}, yours is ${mine}.\n` +
      "Nothing you have pushed since that build is running, so do not trust anything\n" +
      "you measure against the live site until this says otherwise.",
  );
  process.exitCode = 1;
}
