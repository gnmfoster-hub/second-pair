/*
 * The diary search: does it let go, and does it keep off the Add button.
 *
 * Both faults Giles reported were in this one overlay, and neither showed up
 * in anything we already run. check-edges measures what is drawn past the edge
 * of the screen; check-overlap measures boxes sitting on each other at rest.
 * A control that only misbehaves once you have opened it is invisible to both,
 * because at rest it is an icon eight pixels square.
 *
 *   node scripts/check-find.cjs [business-slug]
 *
 * Opens the search on a phone and on a laptop, clicks somewhere else, and says
 * whether it went away. Then, with it open, measures the gap between the right
 * edge of the field and the left edge of Add.
 */
const { chromium } = require("playwright-core");
const { signIn, SITE } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const WIDTHS = [
  ["phone", 390, 844],
  ["laptop", 1440, 900],
];

const FIND = 'button[aria-label="Find somebody in the diary"]';
const FIELD = 'input[aria-label="Find somebody in the diary"]';

(async () => {
  const slug = process.argv[2] ?? "neat-tidy-solutions";
  const { data: s } = await db.from("studios").select("id").eq("slug", slug).single();
  const { data: m } = await db
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", s.id)
    .eq("role", "owner")
    .limit(1);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let faults = 0;

  for (const [label, width, height] of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 700,
      hasTouch: true,
    });
    const page = await signIn(context, m[0].user_id, "/");
    await page.goto(SITE + "/diary", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    await page.click(FIND);
    await page.waitForSelector(FIELD, { timeout: 4000 });

    /*
     * Where Add is while the search is open.
     *
     * Measured rather than eyeballed because the two live in different
     * containers — Add is not inside the header the field covers — so whether
     * they collide depends on widths that change with the screen.
     */
    const gap = await page.evaluate((sel) => {
      const field = document.querySelector(sel);
      const add = [...document.querySelectorAll("a, button")].find((el) =>
        /^\s*(\+\s*)?Add\b/.test(el.textContent ?? ""),
      );
      if (!field || !add) return null;
      const f = field.closest("div").getBoundingClientRect();
      const a = add.getBoundingClientRect();
      // Only a fault if they are on the same line in the first place.
      if (a.bottom < f.top || a.top > f.bottom) return null;
      return Math.round(a.left - f.right);
    }, FIELD);

    if (gap !== null && gap < 0) {
      console.log(`  ${label}: Add sits ${-gap}px inside the search field`);
      faults++;
    } else {
      console.log(`  ${label}: search and Add are ${gap === null ? "not on the same line" : gap + "px apart"}`);
    }

    // Somewhere harmless and definitely elsewhere: the middle of the diary.
    await page.mouse.click(Math.round(width / 2), Math.round(height * 0.7));
    await page.waitForTimeout(400);

    const stillOpen = await page.locator(FIELD).count();
    if (stillOpen) {
      console.log(`  ${label}: clicking away did NOT close it`);
      faults++;
    } else {
      console.log(`  ${label}: clicking away closed it`);
    }

    await context.close();
  }

  await browser.close();
  console.log(faults ? `\n${faults} fault${faults > 1 ? "s" : ""}.` : "\nThe diary search behaves.");
  process.exit(faults ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
