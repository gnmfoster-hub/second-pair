/*
 * The card a link to our own site shows, drawn from the current mark.
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/make-social-card.cjs
 *   ... --write   to overwrite public/brand/png/social-card-default.png
 *
 * Giles, 5 October: "its the old logo."
 *
 * He was right, and about more than the card. The old flat two-hands artwork
 * with the peachy hand is still what social-card-default.png shows, and it is
 * also still what logo/lockup-horizontal-on-paper.svg shows, despite that folder
 * being the one the brand README points at as current. The mark the live site
 * actually renders is mark-3d: a black speech bubble with a cream and a cobalt
 * hand, which is the one everybody has seen on the header all month.
 *
 * So this composes the card from the assets the site itself serves rather than
 * from a file somebody exported once, which is how the two drifted apart in the
 * first place. Run it again whenever the mark changes and the card follows.
 *
 * Deliberately not clever. A mark, a name and the line the site opens with, on
 * the brand paper, at the size every platform crops to.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const SITE = process.env.SITE || "http://localhost:3130";
const OUT = path.join(__dirname, "..", "public", "brand", "png", "social-card-default.png");
const write = process.argv.includes("--write");

/* The brand's own paper and ink, from globals.css. */
const PAPER = "#f7f4ec";
const INK = "#16150f";
const MUTED = "#6b675c";

const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Instrument+Sans:wght@400;500&display=swap">
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; background: ${PAPER}; color: ${INK};
    display: flex; align-items: center; justify-content: center; gap: 56px;
    font-family: "Instrument Sans", system-ui, sans-serif;
  }
  img { width: 232px; height: 232px; display: block; }
  .words { display: flex; flex-direction: column; gap: 14px; }
  h1 {
    font-family: "Anton", sans-serif; font-weight: 400;
    font-size: 104px; line-height: .92; letter-spacing: .01em;
    text-transform: uppercase;
  }
  p { font-size: 28px; color: ${MUTED}; letter-spacing: .01em; }
</style></head>
<body>
  <img src="${SITE}/brand/logo/mark-3d.png" alt="">
  <div class="words">
    <h1>Second<br>Pair</h1>
    <p>You work, we answer.</p>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  await p.setContent(page, { waitUntil: "networkidle" });

  /*
   * Wait for the artwork and the faces, rather than guessing at a delay. A card
   * written while Anton was still loading would be the fallback sans for ever,
   * and nothing downstream would ever notice.
   */
  await p.evaluate(() => document.fonts.ready);
  const mark = await p.evaluate(() => {
    const img = document.querySelector("img");
    return { loaded: img.complete, width: img.naturalWidth };
  });
  const anton = await p.evaluate(() => document.fonts.check("104px Anton"));

  if (!mark.loaded || !mark.width) {
    console.log("  FAULT the mark did not load, so nothing was written");
    process.exit(1);
  }
  if (!anton) {
    console.log("  FAULT Anton did not load, so the wordmark would be a fallback");
    process.exit(1);
  }
  console.log(`  ok    the mark loaded (${mark.width}px) and Anton is ready`);

  const shot = await p.screenshot({ type: "png" });
  await browser.close();

  const preview = path.join(require("os").tmpdir(), "second-pair-shots", "social-card-new.png");
  fs.writeFileSync(preview, shot);
  console.log(`  preview: ${preview}`);

  if (!write) {
    console.log(`\n  Nothing written. Run with --write to replace the card.\n`);
    return;
  }

  const was = fs.existsSync(OUT) ? fs.statSync(OUT).size : 0;
  fs.writeFileSync(OUT, shot);
  console.log(`\n  written: ${OUT}`);
  console.log(`  ${Math.round(was / 1024)}K became ${Math.round(shot.length / 1024)}K\n`);
})();
