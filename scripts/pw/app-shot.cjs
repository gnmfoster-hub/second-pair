/*
 * Pictures of the signed-in app on the local build, for the re-theme.
 *
 *   PAGES='/,/diary' W=1280 OUT=/somewhere node scripts/pw/app-shot.cjs willow-demo
 *
 * Points at a demo by slug so it can never be aimed at a real business by
 * mistyping a user id.
 */
const path = require("path");
const REPO = path.join(process.env.USERPROFILE, "Desktop", "inkdesk");
const { chromium } = require("playwright-core");
const { signIn } = require("./look.cjs");
const { createClient } = require(path.join(REPO, "node_modules", "@supabase", "supabase-js"));

(async () => {
  const slug = process.argv[2] || "willow-demo";
  if (!/-demo$|^help$/.test(slug)) throw new Error(`refusing to sign into ${slug}: demos only`);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: studio } = await db.from("studios").select("id").eq("slug", slug).single();
  const { data: owner } = await db
    .from("studio_members").select("user_id").eq("studio_id", studio.id).limit(1);

  const out = process.env.OUT;
  const w = Number(process.env.W || 1280);
  const pages = (process.env.PAGES || "/").split(",");

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  /*
   * DARK=1 sets the app's own preference, not the OS's.
   *
   * Asking the OS does nothing here: the product defaults to light on purpose
   * and stamps data-theme="light" before hydration unless somebody has chosen
   * otherwise, so prefers-color-scheme never gets a look in. Seeding the same
   * key the toggle writes is the only way to photograph what a customer who
   * picked dark actually sees.
   */
  const dark = process.env.DARK === "1";
  const context = await browser.newContext({ viewport: { width: w, height: 900 } });
  if (dark) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem("secondpair_theme", "dark");
      } catch {
        /* Then the picture comes out light and says so. */
      }
    });
  }
  const page = await signIn(context, owner[0].user_id, "/");
  await page.waitForTimeout(1500);

  for (const href of pages) {
    const name = href === "/" ? "inbox" : href.replace(/[/?=&]/g, "-").replace(/^-/, "");
    await page.goto(process.env.SITE + href, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/app-${name}-${w}${dark ? "-dark" : ""}.png`, fullPage: true });
  }
  await browser.close();
})();
