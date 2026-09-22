// Signs a headless, throwaway Chrome profile into the demo and takes pictures.
const path = require("path");
const REPO = path.join(process.env.USERPROFILE, "Desktop", "inkdesk");
const { createClient } = require(path.join(REPO, "node_modules", "@supabase", "supabase-js"));
const { chromium } = require("playwright-core");

/*
 * The live site by default, and whatever SITE says otherwise.
 *
 * Every visual check here pointed at production, which is the right default
 * and useless for looking at something before it ships: re-theming the whole
 * site, the one question worth asking is what it does at 390px, and the only
 * way to ask it was to deploy first.
 */
const SITE = process.env.SITE || "https://www.second-pair.com";
/*
 * Pictures go outside the repository. A checker that leaves a folder of
 * screenshots in the source tree gets its output committed by accident, and
 * then somebody has to explain why there are forty PNGs in a pull request.
 */
const OUT = path.join(require("os").tmpdir(), "second-pair-shots");
require("fs").mkdirSync(OUT, { recursive: true });

/*
 * The credentials, from the same file the app reads.
 *
 * These checks took them straight from the environment and nothing put them
 * there, so three of them crashed with "supabaseUrl is required" on any shell
 * that had not exported them by hand — and npm run check reported that as
 * three failing checks, which is a morning spent looking for a fault in a
 * product that was fine.
 *
 * Anything already in the environment wins, so a deliberate run against
 * another database works exactly as before.
 */
function loadLocalEnv() {
  const fs = require("fs");
  const file = path.join(REPO, ".env.local");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at < 1) continue;
    const key = trimmed.slice(0, at).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(at + 1).trim();
  }
}
loadLocalEnv();

async function signIn(context, userId, next) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: u } = await db.auth.admin.getUserById(userId);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (error) throw error;
  const page = await context.newPage();
  await page.goto(
    `${SITE}/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(next)}`,
    { waitUntil: "networkidle" },
  );
  return page;
}

module.exports = { signIn, SITE, OUT };

if (require.main === module) {
  (async () => {
    const [who, next, w, h, name] = process.argv.slice(2);
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: Number(w), height: Number(h) },
      deviceScaleFactor: 1,
      isMobile: Number(w) < 700,
      hasTouch: true,
    });
    const page = await signIn(context, who, next);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(page.url());
    await browser.close();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
