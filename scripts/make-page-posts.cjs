/*
 * The Facebook Page post set, one per side of the business.
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/make-page-posts.cjs
 *   ... --write   to save into public/brand/social/posts/
 *
 * Giles: "the facebook page needs to cover all aspects of second pair work."
 *
 * The cover can only say one thing, and it says the assistant. Everything
 * else the company does has to arrive as posts, so this draws a square for
 * each: the assistant, the channels, websites, apps, the client list, and
 * the ask.
 *
 * EVERY HEADLINE IS LIFTED WORD FOR WORD FROM THE SITE. That is not laziness,
 * it is the only safe way to do this. The marketing pages were written
 * carefully and they carry a rule that is easy to break by accident: there is
 * not a single price, turnaround time or guarantee anywhere on any of them,
 * because a number invented in a hurry is a number somebody holds you to.
 * A social post is exactly where that rule gets broken, so none of these
 * invent one.
 *
 * Two places the honest wording had to differ from the site:
 *
 *   The site's "Seven ways in. One diary." counts WhatsApp, Instagram and
 *   Messenger among the seven, and those three are marked "Not yet" on the
 *   same site because they are waiting on Meta. A post saying seven would be
 *   claiming three channels nobody can use, on Meta's own platform. So that
 *   square names the three that are live and says nothing about the rest.
 *
 *   The client square names only the three businesses the site already names
 *   in public: Living Canvas Tattoo, Amber's Paws & Pastures, Neat & Tidy
 *   Solutions. No others, and no invented ones.
 *
 * 1080 square, which is what a feed wants. Posts are not squeezed to 820x312
 * the way a cover is, so these can carry more detail than the cover does, but
 * they are still read at about 500px on a phone, so nothing here is small.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require("playwright-core");

const SITE = process.env.SITE || "http://localhost:3130";
const write = process.argv.includes("--write");

const OUT_DIR = path.join(__dirname, "..", "public", "brand", "social", "posts");
const PREVIEW_DIR = path.join(os.tmpdir(), "second-pair-shots", "posts");

const S = 1080;

const INK = "#16150f";
const MUTED = "#6b675c";
const COBALT = "#2a45f0";
const GROUND = "radial-gradient(900px 760px at 24% 22%, #fdfbf6 0%, #f8f4ea 58%, #f0ebde 100%)";

const FONTS = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Instrument+Sans:wght@400;500;600&display=swap">`;

/**
 * The squares.
 *
 * `head` is the site's own headline. `sub` is the site's own supporting
 * sentence, trimmed but never embellished. `art` picks the furniture.
 */
const POSTS = [
  {
    file: "1-the-assistant",
    /* /system hero title, exact. */
    head: "It answers while you are working.",
    sub: "In your words, from your own prices, and into your diary before you have put the tools down.",
    art: "pair",
  },
  {
    file: "2-one-diary",
    /*
     * Deliberately NOT the site's "Seven ways in. One diary." See the note at
     * the top: three of those seven are waiting on Meta's review, and this is
     * a post on Meta.
     */
    head: "Website, text, email. One diary.",
    sub: "Every enquiry lands in the same place. Nobody retypes anything.",
    art: "list",
    rows: [
      ["Your website", "The assistant sits on the page and answers there."],
      ["Text messages", "Your own number. The one on the van."],
      ["Email", "Your enquiry address, forwarded in."],
    ],
  },
  {
    file: "3-websites",
    /* /websites hero title, exact. */
    head: "The site you keep meaning to sort out.",
    sub: "Built around the work you do, not a theme with your name dropped into it. Hosted and looked after.",
    art: "sites",
  },
  {
    file: "4-our-work",
    /* /work hero title, exact. The three names are the three the site names. */
    head: "A short list, and all of it real.",
    sub: "Live today, with real customers on the other end of it.",
    art: "list",
    rows: [
      ["Living Canvas Tattoo", "livingcanvastattoo.ink. Built, hosted, and the assistant answers on it."],
      ["Amber’s Paws &amp; Pastures", "amberspawsandpastures.com. Answering by text and by email."],
      ["Neat &amp; Tidy Solutions", "A cleaning business, with the assistant on its enquiries."],
    ],
  },
  {
    file: "5-apps",
    /* /apps hero title, exact. Sub is the site's own line. */
    head: "Software for one job, done properly.",
    sub: "Small finished things beat big unfinished ones. It has to be used, not demonstrated.",
    art: "shot",
    shot: "/shots/report.webp",
  },
  {
    file: "6-ask",
    /* The close used on the home page and /system, exact. */
    head: "Give us a second pair of hands!",
    sub: "Fifteen minutes on the phone and we will tell you honestly whether it suits your trade.",
    art: "hand",
    cta: true,
  },
];

const square = (p) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${S}px; height: ${S}px; background: ${GROUND}; color: ${INK};
    font-family: "Instrument Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative; overflow: hidden;
    padding: 84px;
    display: flex; flex-direction: column;
  }
  h1 {
    font-family: "Anton", sans-serif; font-weight: 400; text-transform: uppercase;
    font-size: ${p.art === "hand" || p.art === "pair" ? 86 : 82}px; line-height: 0.92; letter-spacing: 0.012em;
    max-width: ${p.art === "hand" || p.art === "pair" ? 760 : 912}px;
    /* Stops a headline dropping one orphan word onto its own line. */
    text-wrap: balance;
  }
  /* The last sentence in cobalt on the ask, so the call to action is the colour. */
  h1 em { font-style: normal; color: ${COBALT}; }
  p.sub {
    margin-top: 28px; font-size: 31px; line-height: 1.42; color: ${MUTED};
    max-width: ${p.art === "hand" || p.art === "pair" ? 620 : 820}px; font-weight: 500;
  }
  /* Pushed to the bottom so every square has its mark in the same place. */
  /*
   * One left-aligned group, and above everything.
   *
   * The URL used to be pushed to the right with margin-left:auto, which put
   * it exactly where the artwork bleeds in. On the square with the pair of
   * hands the cobalt one covered it completely, and z-index alone would only
   * have moved the problem by printing the address across a thumb.
   */
  .foot { margin-top: auto; display: flex; align-items: center; gap: 16px; position: relative; z-index: 5; }
  .foot img { width: 76px; height: 76px; display: block; }
  .foot b {
    font-family: "Anton", sans-serif; font-weight: 400; text-transform: uppercase;
    font-size: 34px; letter-spacing: 0.02em;
  }
  .foot span { font-size: 26px; color: ${MUTED}; font-weight: 600; }
  .foot i { font-style: normal; color: ${MUTED}; font-size: 26px; }

  /*
   * The hand, with the same cast shadow as the cover so the set hangs
   * together. drop-shadow follows the cut-out's alpha, so it is hand-shaped.
   */
  .hand {
    position: absolute; right: -130px; bottom: 40px; height: 620px;
    transform: rotate(-14deg);
    filter: drop-shadow(-26px 24px 38px rgba(22, 21, 15, 0.24));
  }

  /*
   * The matched pair, for the square about the assistant.
   *
   * Every piece was using the same pointing finger, which is the fastest way
   * to make a set look like one template filled in six times. The brand owns
   * two hands in the same pose, natural and cobalt, and that pair is the
   * company's own name. The cobalt one sits behind and higher.
   */
  .cobalt, .natural {
    position: absolute; filter: drop-shadow(-24px 22px 36px rgba(22,21,15,.22));
  }
  .cobalt  { right: -40px; bottom: -40px; height: 560px; z-index: 1; }
  .natural { right: 170px; bottom: -70px; height: 505px; z-index: 2; }

  /* Real client sites, shown as the things they are rather than as mockups. */
  .sites { margin-top: 46px; display: flex; gap: 26px; }
  .sites figure { flex: 1; min-width: 0; }
  .sites img {
    width: 100%; height: 430px; object-fit: cover; object-position: top center;
    border-radius: 14px; border: 1px solid rgba(22,21,15,.1);
    box-shadow: 0 14px 34px rgba(22, 21, 15, 0.14);
  }
  .sites figcaption { margin-top: 14px; font-size: 24px; color: ${MUTED}; font-weight: 600; }

  /*
   * Named things set as a list rather than a sentence.
   *
   * The client square first ran the three businesses together in one
   * paragraph and left two thirds of the square empty. They are the proof
   * the page exists to show, so they get a row each.
   */
  .rows { margin-top: 52px; }
  .rows div {
    padding: 30px 0; border-top: 1px solid rgba(22,21,15,.14);
    display: flex; flex-direction: column; gap: 8px;
  }
  .rows div:last-child { border-bottom: 1px solid rgba(22,21,15,.14); }
  .rows b {
    font-family: "Anton", sans-serif; font-weight: 400; text-transform: uppercase;
    font-size: 44px; letter-spacing: .012em;
  }
  .rows i { font-style: normal; font-size: 27px; color: ${MUTED}; font-weight: 500; }

  .shot { margin-top: 46px; }
  .shot img {
    width: 100%; height: 470px; object-fit: cover; object-position: top center;
    border-radius: 14px; border: 1px solid rgba(22,21,15,.1);
    box-shadow: 0 14px 34px rgba(22, 21, 15, 0.14);
  }
</style></head>
<body>
  ${p.art === "hand" ? `<img class="hand" src="${SITE}/brand/hands/hand-type.png" alt="">` : ""}
  ${
    p.art === "pair"
      ? `<img class="cobalt" src="${SITE}/brand/hands/hand-second.png" alt="">
         <img class="natural" src="${SITE}/brand/hands/hand-front.png" alt="">`
      : ""
  }
  <h1>${p.head}</h1>
  <p class="sub">${p.sub}</p>
  ${
    p.art === "sites"
      ? `<div class="sites">
           <figure><img src="${SITE}/shots/site-livingcanvas.webp" alt=""><figcaption>livingcanvastattoo.ink</figcaption></figure>
           <figure><img src="${SITE}/shots/site-ambers.webp" alt=""><figcaption>amberspawsandpastures.com</figcaption></figure>
         </div>`
      : ""
  }
  ${
    p.art === "list"
      ? `<div class="rows">${p.rows
          .map(([name, note]) => `<div><b>${name}</b><i>${note}</i></div>`)
          .join("")}</div>`
      : ""
  }
  ${p.art === "shot" ? `<div class="shot"><img src="${SITE}${p.shot}" alt=""></div>` : ""}
  <div class="foot">
    <img src="${SITE}/brand/logo/mark-3d.png" alt="">
    <b>Second Pair</b>
    <i>&middot;</i>
    <span>second-pair.com</span>
  </div>
</body></html>`;

(async () => {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const made = [];

  for (const p of POSTS) {
    const page = await browser.newPage({
      viewport: { width: S, height: S },
      deviceScaleFactor: 1,
    });
    await page.setContent(square(p), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    if (!(await page.evaluate(() => document.fonts.check("86px Anton")))) {
      throw new Error(`${p.file}: Anton did not load, so the headline would be a fallback`);
    }
    /*
     * Every image checked, not just the ones I remembered to check. A post
     * that goes out with a blank rectangle where a client's website should be
     * is worse than no post, and it is silent.
     */
    const broken = await page.evaluate(() =>
      [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src),
    );
    if (broken.length) throw new Error(`${p.file}: these did not load: ${broken.join(", ")}`);

    /*
     * Nothing readable should run off the bottom of a fixed square.
     *
     * Measured on the footer, which is the last thing in the flow, rather
     * than on scrollHeight. scrollHeight counts the hand, and a 620px image
     * rotated 14 degrees has a bounding box taller than itself, so the first
     * version of this check failed every square that had a hand on it while
     * the artwork was in fact clipped correctly by overflow:hidden.
     */
    const footBottom = await page.evaluate(
      () => Math.round(document.querySelector(".foot").getBoundingClientRect().bottom),
    );
    if (footBottom > S) throw new Error(`${p.file}: the text runs ${footBottom - S}px past the bottom`);

    const shot = await page.screenshot({ type: "png" });
    fs.writeFileSync(path.join(PREVIEW_DIR, `${p.file}.png`), shot);
    made.push([p.file, shot]);
    await page.close();
    console.log(`  ok    ${p.file}`);
  }

  await browser.close();
  console.log(`\n  previews: ${PREVIEW_DIR}`);

  if (!write) {
    console.log(`\n  Nothing saved into the repo. Run with --write to keep them.\n`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, buf] of made) fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), buf);
  console.log(`\n  written into ${OUT_DIR}\n`);
})();
