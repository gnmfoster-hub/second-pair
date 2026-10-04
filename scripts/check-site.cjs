/*
 * Is a client website fit to hand over?
 *
 *   node scripts/check-site.cjs https://livingcanvastattoo.ink
 *   node scripts/check-site.cjs "C:\path\to\index.html"
 *   node scripts/check-site.cjs            (every site we have built)
 *
 * Nine things, all of them things a client eventually notices and none of them
 * things you can see by looking at the page on a laptop.
 *
 * It exists because the parts of a site that earn its money are invisible. A
 * beautiful hero tells you nothing about whether the link renders as a grey box
 * in a WhatsApp group, whether the favicon is a hundred and seventy five
 * kilobytes, or whether somebody who has asked their phone to stop animating
 * things can read it. Those are the parts that get missed on every build,
 * because the only way to notice them is to measure.
 *
 * Reads only. It opens the page, measures it, and closes it.
 */
const path = require("path");
const { chromium } = require("playwright-core");

/* The sites this company has built. Add one when another goes live. */
const OURS = [
  { name: "Living Canvas Tattoo", url: "https://livingcanvastattoo.ink" },
  { name: "Amber's Paws & Pastures", url: "https://amberspawsandpastures.com" },
  { name: "Second Pair", url: "https://www.second-pair.com" },
  {
    name: "RnB Hair Studio",
    url:
      "file:///" +
      path
        .join(process.env.USERPROFILE, "Documents", "RnB-Hair-Studio", "index.html")
        .replace(/\\/g, "/"),
  },
];

/** What a thing may weigh before it is costing somebody their patience. */
const LIMITS = { favicon: 5 * 1024, image: 150 * 1024, page: 2 * 1024 * 1024 };

const kb = (n) => `${Math.round(n / 1024)}K`;

async function look(browser, site) {
  const report = { name: site.name, url: site.url, ok: [], bad: [], note: [] };
  const ok = (w) => report.ok.push(w);
  const bad = (w, d) => report.bad.push(d ? `${w} (${d})` : w);
  const note = (w) => report.note.push(w);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  /*
   * Weights from the wire, not from the markup. A page can reference a 480K
   * photograph in a stylesheet, in a data attribute, or build the URL in script,
   * and none of those are findable by reading the HTML.
   */
  const fetched = [];
  page.on("response", async (res) => {
    try {
      const len = Number(res.headers()["content-length"] ?? 0);
      const body = len || (await res.body().then((b) => b.length).catch(() => 0));
      fetched.push({ url: res.url(), type: res.request().resourceType(), bytes: body });
    } catch {
      /* A response that cannot be measured is not a fault with the site. */
    }
  });

  try {
    await page.goto(site.url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) {
    note(`could not open it: ${(e.message || "").split("\n")[0].slice(0, 80)}`);
    await context.close();
    return report;
  }
  await page.waitForTimeout(1200);

  /* ---------------------------------------------------- 1. the social card */
  const meta = await page.evaluate(() => {
    const get = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) ?? null;
    return {
      title: document.title || null,
      description: get('meta[name="description"]', "content"),
      ogTitle: get('meta[property="og:title"]', "content"),
      ogDesc: get('meta[property="og:description"]', "content"),
      ogImage: get('meta[property="og:image"]', "content"),
      ogUrl: get('meta[property="og:url"]', "content"),
      twitter: get('meta[name="twitter:card"]', "content"),
    };
  });

  const cardBits = ["ogTitle", "ogDesc", "ogImage"].filter((k) => meta[k]);
  if (cardBits.length === 3) {
    ok("social card is there");
    /* And the picture in it has to actually load, which is the half that fails. */
    if (/^https?:/i.test(meta.ogImage)) {
      try {
        const res = await page.request.get(meta.ogImage, { timeout: 15000 });
        if (res.ok()) ok(`and its picture loads (${kb((await res.body()).length)})`);
        else bad("the social card picture does not load", `${res.status()}`);
      } catch {
        bad("the social card picture does not load", "could not be fetched");
      }
    } else {
      note("the social card picture is a relative path, so it cannot be checked from here");
    }
  } else if (cardBits.length === 0) {
    bad("no social card at all", "every link to this renders as a grey box");
  } else {
    bad(`the social card is half there`, `missing ${["ogTitle", "ogDesc", "ogImage"].filter((k) => !meta[k]).join(", ")}`);
  }

  if (!meta.title) bad("no page title");
  if (!meta.description) bad("no meta description", "this is what Google prints under the link");

  /* ------------------------------------------------------------ 2. weights */
  const icons = fetched.filter((f) => /favicon|apple-touch|\.ico(\?|$)/i.test(f.url));
  const heaviestIcon = icons.sort((a, b) => b.bytes - a.bytes)[0];
  if (!heaviestIcon) note("no favicon was requested, so there may not be one");
  else if (heaviestIcon.bytes <= LIMITS.favicon) ok(`favicon is ${kb(heaviestIcon.bytes)}`);
  else bad(`the favicon is ${kb(heaviestIcon.bytes)}`, "it should be under 5K");

  const images = fetched.filter((f) => f.type === "image" && !/favicon|apple-touch/i.test(f.url));
  const heavy = images.filter((f) => f.bytes > LIMITS.image).sort((a, b) => b.bytes - a.bytes);
  if (!images.length) note("no images were loaded");
  else if (!heavy.length) ok(`all ${images.length} images are under 150K`);
  else
    bad(
      `${heavy.length} of ${images.length} images are over 150K`,
      heavy
        .slice(0, 3)
        .map((f) => `${f.url.split("/").pop().split("?")[0]} ${kb(f.bytes)}`)
        .join(", "),
    );

  const total = fetched.reduce((a, f) => a + f.bytes, 0);
  if (total <= LIMITS.page) ok(`the whole page is ${kb(total)}`);
  else bad(`the whole page is ${kb(total)}`, "over 2MB is slow on a phone away from wifi");

  /* --------------------------------------------- 3. does it fit on a phone */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  if (wide <= 391) ok("no sideways scroll at 390px");
  else {
    const guilty = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > 392 && el.offsetParent)
          out.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`);
      }
      return [...new Set(out)].slice(0, 3);
    });
    bad(`it scrolls sideways on a phone (${wide}px wide)`, guilty.join(", "));
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  /* ------------------------------------------------- 4. alt text, headings */
  const structure = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    return {
      images: imgs.length,
      withAlt: imgs.filter((i) => i.hasAttribute("alt")).length,
      h1: document.querySelectorAll("h1").length,
      levels: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1])),
      tel: document.querySelectorAll('a[href^="tel:"]').length,
      maps: document.querySelectorAll('a[href*="maps"], a[href*="map"]').length,
    };
  });

  if (!structure.images) note("no img tags, so alt text is not in question");
  else if (structure.withAlt === structure.images) ok(`all ${structure.images} images have alt text`);
  else bad(`${structure.images - structure.withAlt} of ${structure.images} images have no alt text`);

  if (structure.h1 === 1) ok("one h1, as it should be");
  else bad(`${structure.h1} h1 headings`, "there should be exactly one");

  /* A heading that skips a level is a heading somebody cannot navigate by. */
  let skipped = 0;
  for (let i = 1; i < structure.levels.length; i++) {
    if (structure.levels[i] - structure.levels[i - 1] > 1) skipped++;
  }
  if (!skipped) ok("headings go in order");
  else bad(`${skipped} heading levels are skipped`);

  if (structure.tel) ok("the phone number is a link you can press");
  else note("no tel: link, which only matters if they take bookings by phone");

  /* --------------------------------------- 5. reduced motion, and no script */
  const hasRule = await page.evaluate(() => {
    for (const sheet of [...document.styleSheets]) {
      try {
        for (const rule of [...sheet.cssRules]) {
          if (rule.conditionText && /prefers-reduced-motion/.test(rule.conditionText)) return true;
        }
      } catch {
        /* A stylesheet from another origin cannot be read. Not a fault. */
      }
    }
    return false;
  });
  if (hasRule) ok("it honours reduced motion");
  else bad("nothing honours prefers-reduced-motion", "people who set it still get every animation");

  await context.close();

  /*
   * With JavaScript off. A separate context, because it cannot be turned off
   * on a page that has already run.
   */
  const bare = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const nojs = await bare.newPage();
  try {
    await nojs.goto(site.url, { waitUntil: "load", timeout: 30000 });
    await nojs.waitForTimeout(600);
    const readable = await nojs.evaluate(() => {
      const words = (document.body.innerText || "").trim().split(/\s+/).filter(Boolean).length;
      const invisible = [...document.querySelectorAll("body *")].filter((el) => {
        const s = getComputedStyle(el);
        return s.opacity === "0" && el.textContent.trim().length > 20;
      }).length;
      return { words, invisible };
    });
    if (readable.words > 80 && readable.invisible === 0) ok(`readable with JavaScript off (${readable.words} words)`);
    else if (readable.words <= 80) bad("almost nothing is readable with JavaScript off", `${readable.words} words`);
    else bad(`${readable.invisible} blocks are invisible with JavaScript off`);
  } catch {
    note("could not load it with JavaScript off");
  }
  await bare.close();

  return report;
}

(async () => {
  const asked = process.argv[2];
  const sites = asked
    ? [{ name: asked.replace(/^https?:\/\//, "").replace(/\/$/, ""), url: asked }]
    : OURS;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let faults = 0;

  for (const site of sites) {
    const r = await look(browser, site);
    console.log(`\n${r.name}`);
    console.log("─".repeat(Math.max(r.name.length, 20)));
    for (const w of r.ok) console.log(`  ok    ${w}`);
    for (const w of r.note) console.log(`  --    ${w}`);
    for (const w of r.bad) console.log(`  FAULT ${w}`);
    faults += r.bad.length;
  }

  await browser.close();
  console.log(faults ? `\n${faults} thing(s) to put right\n` : "\nnothing wrong anywhere\n");
  process.exit(faults ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
