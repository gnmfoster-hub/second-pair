/*
 * What a customer sees, checked the way a customer arrives: signed in to
 * nothing.
 *
 *   node scripts/check-public.cjs
 *
 * check-pages walks the business's own screens. These are the other side —
 * the widget on their website, a form sent by text, somebody's own marketing
 * preferences, the pages Stripe returns to, and the marketing site. They
 * matter more: a broken screen inside the app annoys the owner, a broken
 * widget loses them the enquiry and nobody ever finds out.
 *
 * Real tokens are used where a real token is needed, taken from rows that
 * already exist, and nothing is submitted.
 */
const { chromium } = require("playwright-core");
/*
 * For the credentials, which it loads from .env.local.
 *
 * This check never signs in, but it read the environment for a database key
 * that nothing put there — so it crashed on any shell that had not exported
 * one by hand, and npm run check called that a failing check.
 */
require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const SITE = process.env.SITE ?? "https://www.second-pair.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BAD = /Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error|\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date/;

(async () => {
  const { data: studios, error } = await db
    .from("studios")
    .select("id, slug")
    .is("archived_at", null)
    .order("slug");
  if (error) throw new Error(error.message);

  /* Tokens that already exist, so nothing has to be created to look at. */
  const { data: form } = await db
    .from("client_forms")
    .select("token")
    .not("token", "is", null)
    .limit(1)
    .maybeSingle();
  const { data: prefs } = await db
    .from("contacts")
    .select("marketing_token")
    .not("marketing_token", "is", null)
    .limit(1)
    .maybeSingle();

  const pages = [
    "/",
    "/company",
    "/privacy",
    "/terms",
    "/login",
    "/reset-password",
    "/pay/done",
    "/pay/cancelled",
    "/pay/not-needed",
    ...studios.map((s) => `/widget/${s.slug}`),
    ...(form?.token ? [`/f/${form.token}`] : []),
    ...(prefs?.marketing_token ? [`/prefs/${prefs.marketing_token}`] : []),
    /* Addresses that should refuse rather than break. */
    "/widget/no-such-business",
    "/f/not-a-real-token",
    "/prefs/not-a-real-token",
  ];

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let problems = 0;

  for (const [label, width, height] of [["phone", 390, 844], ["laptop", 1280, 900]]) {
    console.log(`\n───────── ${label} ─────────`);
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 700, hasTouch: true });
    const page = await context.newPage();

    for (const href of pages) {
      const errs = [];
      const onPageError = (e) => errs.push("threw: " + String(e).slice(0, 110));
      const onResponse = (r) => {
        const u = r.url();
        if (r.status() >= 500 && u.startsWith(SITE)) errs.push(`${r.status()} on ${u.replace(SITE, "")}`);
      };
      page.on("pageerror", onPageError);
      page.on("response", onResponse);

      const answer = await page.goto(SITE + href, { waitUntil: "networkidle" }).catch((e) => {
        errs.push("did not load: " + e.message.slice(0, 70));
        return null;
      });
      await page.waitForTimeout(500);

      const text = await page.evaluate(() => document.body.innerText).catch(() => "");
      const bad = text.match(BAD);

      /*
       * An address that should refuse is expected to say so. A 404 on one of
       * those is the right answer, not a fault — what would be wrong is a
       * stack trace, or somebody else's business.
       */
      const meantToRefuse = /no-such-business|not-a-real-token/.test(href);
      if (bad && !meantToRefuse) errs.push(`shows "${bad[0]}"`);
      /*
       * A soft refusal is the right answer here, not a 404.
       *
       * "This form is not available — it may have been withdrawn, or the link
       * was copied wrongly" is kinder than a status code to somebody who was
       * sent a link by their hairdresser, and these pages are noindex anyway.
       * What would be wrong is a stack trace, or somebody else's business. So
       * this checks that it says so, not what number it says it with.
       */
      const refused = /not available|not found|cannot find|no longer|not here|expired|withdrawn/i.test(text);
      if (meantToRefuse && answer && answer.status() < 400 && !refused) {
        errs.push(`answered ${answer.status()} and did not say why`);
      }

      page.off("pageerror", onPageError);
      page.off("response", onResponse);

      if (errs.length) {
        problems++;
        console.log(`  ${href}\n      ${errs.join("\n      ")}`);
      }
    }

    await context.close();
  }

  /*
   * And the front door: clicking Sign in, rather than loading /login.
   *
   * Every check above loads a page by its address, and this fault could not be
   * seen that way — /login fetched directly is perfect. It only broke when
   * somebody clicked the link: the router used a prefetched copy and rendered
   * nothing, so the URL was right, the body held three script tags and no
   * words, and not one thing was logged anywhere.
   *
   * Giles found it, which is the part worth fixing. A visitor who meets it
   * gets a blank page on the single link that leads to the paying half of the
   * product, and the only way out is a reload nobody thinks to try.
   *
   * So this clicks it the way a person does. Cheap, and it covers the class:
   * a change that puts the prefetch back, or breaks that route some other
   * way, shows up here rather than in a message from Giles.
   */
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${SITE}/`, { waitUntil: "networkidle", timeout: 30000 });
      const link = page.locator('a[href="/login"]').first();

      if (!(await link.count())) {
        problems++;
        console.log("  the front page has no Sign in link at all");
      } else {
        await link.click();
        await page.waitForTimeout(2500);
        const words = (await page.locator("body").innerText()).trim();
        if (!/\/login/.test(page.url())) {
          problems++;
          console.log(`  clicking Sign in went to ${page.url()}`);
        } else if (words.length < 40) {
          problems++;
          console.log(
            `  clicking Sign in landed on a blank page (${words.length} characters).` +
              "\n      Loading /login directly still works, which is what makes this easy to miss.",
          );
        }
      }
    } catch (e) {
      problems++;
      console.log(`  could not click Sign in: ${e.message || e}`);
    }
    await context.close();
  }

  await browser.close();
  console.log(
    `\n${pages.length * 2} looked at, and Sign in clicked. ${problems ? `${problems} with something wrong.` : "Nothing wrong anywhere."}`,
  );

  // Said in the exit code too, so the suite above cannot report a pass over it.
  process.exitCode = problems ? 1 : 0;
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
