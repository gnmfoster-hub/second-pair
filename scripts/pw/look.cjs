// Signs a headless, throwaway Chrome profile into the demo and takes pictures.
const path = require("path");
const REPO = path.join(process.env.USERPROFILE, "Desktop", "inkdesk");
const { createClient } = require(path.join(REPO, "node_modules", "@supabase", "supabase-js"));
const { chromium } = require("playwright-core");

const SITE = "https://www.second-pair.com";
/*
 * Pictures go outside the repository. A checker that leaves a folder of
 * screenshots in the source tree gets its output committed by accident, and
 * then somebody has to explain why there are forty PNGs in a pull request.
 */
const OUT = path.join(require("os").tmpdir(), "second-pair-shots");
require("fs").mkdirSync(OUT, { recursive: true });

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
