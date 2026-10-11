/*
 * Are the registered details on every page, and are the Meta channels hedged?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-contact-and-soon.cjs
 *
 * Two jobs, both of them the kind nobody notices is undone.
 *
 * The first is corroboration. A verification reviewer, and anybody else asking
 * whether this company exists, lands on whichever page they were sent and
 * matches three things: the name, the registered office and a telephone
 * number. Until 11 October the site carried two of the three and no number at
 * all, which is why the first application failed. This checks all four details
 * on a sample of pages rather than only on /company, because /company is not
 * where anybody arrives.
 *
 * The second is honesty. The home page played WhatsApp, Instagram and
 * Messenger as three of seven ways in, with a paid deposit against one of
 * them, while /system told the same visitor those three need Meta's review
 * and are not switched on. This fails if the home page ever claims them
 * without saying so again.
 *
 * Reads only. It opens the pages, looks, and closes them.
 */
const { chromium } = require("playwright-core");

const SITE = process.env.SITE || "http://localhost:3130";

/* Worded as the register words them: this is what is being matched. */
const DETAILS = [
  ["company number", "17453965"],
  ["registered office", "13 Bugle Place"],
  ["postcode", "TQ12 1GZ"],
  ["telephone", "07861 911077"],
  ["email", "info@second-pair.com"],
];

/* Not only /company. The point is that it does not matter where they land. */
const PAGES = ["/", "/company", "/system", "/work", "/terms", "/privacy"];

/* The three that need Meta's review before anybody can use them. */
const META = ["WhatsApp", "Instagram", "Messenger"];

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w) => {
  faults++;
  console.log(`  FAULT ${w}`);
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  console.log(`\nThe registered details, on every page\n`);
  for (const path of PAGES) {
    await page.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded" });
    /* Text as rendered, not markup: a detail inside a comment is not on the page. */
    const text = await page.evaluate(() => document.body.innerText);
    const missing = DETAILS.filter(([, v]) => !text.includes(v)).map(([k]) => k);
    if (missing.length) bad(`${path} is missing the ${missing.join(", ")}`);
    else ok(`${path} carries all ${DETAILS.length}`);
  }

  /*
   * The telephone has to be diallable, not only printed. A number somebody
   * has to retype into a keypad is a number they do not ring.
   */
  await page.goto(`${SITE}/company`, { waitUntil: "domcontentloaded" });
  const tel = await page.$('a[href="tel:+447861911077"]');
  tel ? ok(`/company has it as a tel: link`) : bad(`/company prints the number but does not link it`);

  console.log(`\nThe Meta channels, on the home page\n`);
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
  const home = await page.evaluate(() => document.body.innerText);

  /*
   * Only a named channel needs the caveat. If a future edit drops WhatsApp
   * from the evening entirely there is nothing left to hedge, and this should
   * say so rather than fail.
   */
  for (const name of META) {
    if (!home.includes(name)) {
      ok(`${name} is not claimed on the home page`);
      continue;
    }
    /* The badge sits inside the same row as the label. */
    const hedged = await page.evaluate((n) => {
      const rows = [...document.querySelectorAll(".sp-eve-chan, .sp-eve-who")];
      const mine = rows.filter((r) => r.textContent.includes(n));
      return mine.length > 0 && mine.every((r) => /coming soon/i.test(r.textContent));
    }, name);
    hedged
      ? ok(`${name} is named and marked coming soon`)
      : bad(`${name} is named on the home page with nothing saying it is not switched on`);
  }

  /* The ones that genuinely are live must NOT be hedged, or the badge means nothing. */
  const live = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".sp-eve-chan")];
    return rows
      .filter((r) => /text message|email|your website|phone call/i.test(r.textContent))
      .filter((r) => /coming soon/i.test(r.textContent))
      .map((r) => r.textContent.trim());
  });
  live.length
    ? bad(`a live channel is marked coming soon: ${live.join(", ")}`)
    : ok(`the live channels are not marked coming soon`);

  await browser.close();
  console.log(faults ? `\n${faults} to fix\n` : `\nall good\n`);
  process.exit(faults ? 1 : 0);
})();
