/*
 * Does every brand file the site asks for actually exist?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-brand-files.cjs
 *
 * Written while deleting the old artwork, because this is exactly the job that
 * goes wrong quietly. A missing logo is not an error anybody reports: the page
 * loads, nothing throws, and a blank square sits in a status bar or a browser
 * tab for a fortnight.
 *
 * It found one before a single file was deleted. public/sw.js had been asking
 * for /brand/png/favicon-32.png since the day push notifications were built,
 * and that file has never existed; the badge on every notification was a 404.
 *
 * So it reads the paths out of the places that name them, and fetches each one.
 */
const fs = require("fs");
const path = require("path");
const { SITE } = require("./pw/look.cjs");

const ROOT = path.join(__dirname, "..");

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};

/** Every /brand/... path written down anywhere that serves the live site. */
function wanted() {
  const looked = [
    "public/manifest.webmanifest",
    "public/sw.js",
    "src/app/layout.tsx",
    "src/components/Logo.tsx",
  ];

  /* And every marketing page, which is where the hands come from. */
  const walk = (dir, out = []) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full, out);
      else if (/\.(tsx?|css)$/.test(name)) out.push(full);
    }
    return out;
  };
  looked.push(
    ...walk(path.join(ROOT, "src", "app")).map((f) => f.slice(ROOT.length + 1)),
  );

  const found = new Map();
  for (const rel of [...new Set(looked)]) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    /*
     * Comments stripped first.
     *
     * The first run of this reported /brand/png/favicon-32.png as missing and
     * blamed sw.js, which had just been fixed: the old path was still sitting
     * in the comment explaining why it had been wrong. A check that reads prose
     * as if it were code keeps reporting faults that are already fixed, which
     * is the fastest way to teach somebody to ignore it.
     */
    const text = fs
      .readFileSync(full, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    for (const m of text.matchAll(/\/brand\/[A-Za-z0-9/._-]+\.[A-Za-z0-9]+/g)) {
      if (!found.has(m[0])) found.set(m[0], rel);
    }
  }
  return found;
}

(async () => {
  const paths = wanted();
  console.log(`\n${paths.size} brand files are asked for by name.\n`);

  for (const [url, who] of [...paths].sort()) {
    const onDisk = fs.existsSync(path.join(ROOT, "public", url.slice(1)));
    let served = null;
    try {
      const res = await fetch(`${SITE}${url}`);
      served = res.status;
    } catch {
      served = null;
    }

    if (onDisk && served === 200) ok(`${url}`);
    else if (!onDisk) bad(`${url} is asked for by ${who} and is not on disk`);
    else bad(`${url} is on disk but came back ${served ?? "nothing"}`);
  }

  console.log(faults ? `\n${faults} missing\n` : `\nnothing missing\n`);
  process.exit(faults ? 1 : 0);
})();
