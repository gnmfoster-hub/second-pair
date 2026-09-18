/*
 * Every check, in one command, in the order that fails fastest.
 *
 *   npm run check          the quick ones — about two minutes
 *   npm run check -- --all everything, including the slow screen sweep
 *
 * There are nine of these now and nothing that runs them together, so which
 * ones get run depends on which ones somebody remembers. That is not a
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
  {
    name: "every screen of every business",
    run: ["node", "scripts/check-pages.cjs"],
    /** Ten minutes. */
    slow: true,
  },
];

const chosen = checks.filter((c) => all || c.quick);

console.log(
  all
    ? `Running all ${chosen.length} checks. The last one takes about ten minutes.`
    : `Running the ${chosen.length} quick checks. Add --all for the rest.`,
);

/** Runs one and hands back whether it passed, keeping its output on screen. */
function runOne(check) {
  return new Promise((resolve) => {
    const [command, ...args] = check.run;
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

const failed = [];

for (const check of chosen) {
  const note = check.writes ? " (writes to the demo)" : check.slow ? " (slow)" : "";
  console.log(`\n─────── ${check.name}${note} ───────`);
  if (!(await runOne(check))) failed.push(check.name);
}

console.log("");
if (failed.length === 0) {
  console.log(`All ${chosen.length} passed.`);
  process.exit(0);
}

/*
 * Named rather than counted. "3 failed" sends somebody back up the scrollback
 * through ten minutes of output to find out which three.
 */
console.log(`Failed: ${failed.join(", ")}`);
process.exit(1);
