/*
 * The Facebook Page artwork, drawn from the mark the site actually serves.
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/make-page-art.cjs
 *   ... --write   to save into public/brand/social/
 *
 * Same reasoning as make-social-card.cjs, and the same reason for existing.
 *
 * public/brand/social-avatar.png has been sitting in the repo since 21
 * September showing a flat cream and cobalt hand pair on a black circle. The
 * site has never rendered that artwork. It serves mark-3d on paper and
 * mark-flat-reversed on ink, and the 3D bubble is what everybody has seen on
 * the header all month. Upload the flat circle to Facebook and the Page does
 * not match the website, which is exactly how the old two-hands card survived
 * until Giles noticed it on 5 October.
 *
 * So this composes both pieces from what the running site hands back, not
 * from a file somebody exported once. Change the mark and run it again.
 *
 * Two pieces, deliberately different jobs:
 *
 *   profile  the mark on paper. Identity, nothing else. Facebook crops it to
 *            a circle, so everything sits inside the inscribed circle with
 *            room to spare.
 *
 *   cover    the proposition on ink, so the paper avatar punches out of it
 *            rather than disappearing into it. The words are the strapline
 *            the site already uses and a sentence lifted from /company. No
 *            claim is invented here: a cover is the last place to put a
 *            number somebody will hold you to.
 *
 * The crops are the whole difficulty. Facebook shows a cover at 820x312 on a
 * desktop and 640x360 on a phone, from one uploaded image. The phone keeps
 * the full height and takes a narrower slice of the width, so the safe width
 * is 312 * (640/360) = 554 of the 820, centred: about 68 per cent. Everything
 * that must survive is inside that. The desktop also parks the round profile
 * picture over the bottom left of the cover, so the bottom band is left
 * empty rather than trusted.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require("playwright-core");

const SITE = process.env.SITE || "http://localhost:3130";
const write = process.argv.includes("--write");

const OUT_DIR = path.join(__dirname, "..", "public", "brand", "social");
const PREVIEW_DIR = path.join(os.tmpdir(), "second-pair-shots", "page-art");

/* The brand's own ink and paper, from globals.css and its .sp-night block. */
const PAPER = "#f7f4ec";
const INK = "#16150f";
const MUTED = "#6b675c";
const NIGHT = "#0c0d16";
const ON_NIGHT = "#f7f4ec";
const NIGHT_MUTED = "rgba(247, 244, 236, 0.74)";
const ACCENT = "#8194ff";

const FONTS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Instrument+Sans:wght@400;500;600&display=swap">`;

/*
 * 1024 because Facebook resamples the profile picture hard and an upload at
 * the display size arrives soft. The circle it crops to is the full width,
 * so the mark is kept well inside it.
 */
const PROFILE = { w: 1024, h: 1024 };

/* 2x the 820x312 desktop frame, so it is still sharp on a retina laptop. */
const COVER = { w: 1640, h: 624 };
/* 554/820 of the width, centred: what survives the phone crop. */
const COVER_SAFE = Math.round(COVER.w * (554 / 820));

const profileHtml = `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${PROFILE.w}px; height: ${PROFILE.h}px; background: ${PAPER};
    display: grid; place-items: center;
  }
  /*
   * 780 of 1024.
   *
   * 700 left a ring of paper wide enough that the mark read small in a feed,
   * where this is shown at about forty pixels. The bubble is rounded and its
   * artwork is inset, so at 780 the furthest corner is still roughly 440 from
   * the centre against the 512 the circle gives, and nothing is clipped.
   */
  img { width: 780px; height: 780px; display: block; }
</style></head>
<body><img src="${SITE}/brand/logo/mark-3d.png" alt=""></body></html>`;

/*
 * The ground of the hands photography, sampled from the file rather than
 * assumed. It is #f8f6ef, a shade lighter than the brand paper at #f7f4ec,
 * and the difference is enough to draw a visible rectangle around the
 * photograph if the page is painted in the brand value instead.
 */
const HAND_PAPER = "#f8f6ef";

/* The blue of the second hand, so the type and the photograph agree. */
const COBALT = "#2a45f0";

/*
 * Giles's own line, kept.
 *
 * "You've only got one pair of hands. We're the second." is already the Page
 * bio and it is the better line, because the photograph is literally it: two
 * hands, one of them ours. The complaint was the execution, not the idea, so
 * this rebuilds it with the real brand photography, Anton set properly, and
 * the safe area respected. The words are his.
 */
const HEADLINE = `<h1>You've only got<br>one pair of hands.<br><span>We're the second.</span></h1>`;

/*
 * The arrangement, arrived at by drawing two and looking at them.
 *
 * The first held everything inside the safe band so nothing could ever be
 * cropped. Nothing was, and the hands ended up small and floating in the
 * middle of a lot of empty paper with their wrists stopping in mid-air.
 *
 * The second let the hands bleed off the right edge at full size. Much more
 * confident, but it cut the blue hand in half on a phone, clipped the
 * fingertips against the top edge, and the words ran flush to the crop edge
 * because the type began exactly where the safe band began.
 *
 * This is the third. The hands are large and bleed off the BOTTOM, so the
 * wrists leave the frame the way they would in print rather than hanging
 * above the edge, and the pair sits far enough inside that a phone loses
 * only the outer edge of the blue hand. The words are held a clear margin
 * inside the safe band rather than against it. A photograph running off an
 * edge reads as intentional; cropped words never do.
 */
const coverHtml = `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${COVER.w}px; height: ${COVER.h}px; background: ${HAND_PAPER};
    color: ${INK}; font-family: "Instrument Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative; overflow: hidden;
  }
  /*
   * The hands, bleeding off the bottom so the wrists leave the frame.
   * right:100 keeps the blue hand's outer edge close enough to the safe
   * band that a phone loses only its edge, not half of it.
   */
  .hands { position: absolute; height: 580px; right: 100px; bottom: -60px; }
  /*
   * 56px clear of the safe band, not flush to it. Type that starts exactly
   * where the crop starts touches the edge of the frame on a phone.
   */
  .words {
    position: absolute;
    left: ${(COVER.w - COVER_SAFE) / 2 + 56}px;
    top: 205px;
    width: 545px;
  }
  h1 {
    font-family: "Anton", sans-serif; font-weight: 400;
    font-size: 70px; line-height: 0.96; letter-spacing: 0.012em;
    text-transform: uppercase;
  }
  h1 span { color: ${COBALT}; }
</style></head>
<body>
  <img class="hands" src="${SITE}/brand/hands/hands-seq-01.png" alt="">
  <div class="words">
    ${HEADLINE}
  </div>
</body></html>`;

const coverHtmlOld = `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${COVER.w}px; height: ${COVER.h}px; background: ${NIGHT};
    color: ${ON_NIGHT};
    font-family: "Instrument Sans", system-ui, sans-serif;
    /* Subpixel rendering fringes colour on a dark ground; this is a flat image. */
    -webkit-font-smoothing: antialiased;
    display: flex; align-items: center; justify-content: center;
    /*
     * The bottom 108px is left empty on purpose. On a desktop the round
     * profile picture sits over the bottom left of this image, and anything
     * put there is read with a face on top of it.
     */
    padding: 84px 0 108px;
  }
  /*
   * No mark on the cover.
   *
   * Facebook parks the round profile picture on top of this image, and the
   * profile picture is the mark. A logo here puts the same artwork twice
   * within a hundred pixels of itself. It also solved a real problem: the
   * reversed mark carries its own black ground, which sat on the night blue
   * as a visible darker rectangle, and the 3D bubble is black on black here.
   * The cover carries the words, the avatar carries the mark.
   */
  .safe {
    width: ${COVER_SAFE}px;
    text-align: center;
  }
  h1 {
    font-family: "Anton", sans-serif; font-weight: 400;
    font-size: 104px; line-height: 0.9; letter-spacing: 0.012em;
    text-transform: uppercase;
  }
  /* The one spot of colour, on the half of the line that is the promise. */
  h1 span { color: ${ACCENT}; }
  p {
    margin: 26px auto 0; font-size: 27px; line-height: 1.4;
    color: ${NIGHT_MUTED}; max-width: 42ch;
  }
  .url {
    margin-top: 26px; font-size: 20px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase; color: ${ON_NIGHT};
  }
</style></head>
<body>
  <div class="safe">
    <h1>You work, <span>we answer.</span></h1>
    <p>An assistant that answers the phone and the messages for businesses
       that work by appointment.</p>
    <div class="url">second-pair.com</div>
  </div>
</body></html>`;

/** Render one page and hand back the PNG, refusing to guess at a delay. */
async function draw(browser, { html, size, needsMark, needsType, clip }) {
  const page = await browser.newPage({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "networkidle" });

  /*
   * Wait for the artwork and the faces rather than guessing. Anything written
   * while Anton was still loading is a fallback sans for ever, and nothing
   * downstream would notice.
   */
  await page.evaluate(() => document.fonts.ready);

  if (needsMark) {
    const mark = await page.evaluate(() => {
      const img = document.querySelector("img");
      return { loaded: img.complete, width: img.naturalWidth };
    });
    if (!mark.loaded || !mark.width) {
      throw new Error("the mark did not load, so nothing was written");
    }
  }
  /*
   * Only where there are words. A browser does not fetch a face nothing
   * uses, so asking for Anton on the profile picture, which is the mark and
   * nothing else, fails every time and says the font is broken when it is
   * simply not wanted.
   */
  if (needsType) {
    const anton = await page.evaluate(() => document.fonts.check("92px Anton"));
    if (!anton) throw new Error("Anton did not load, so the wordmark would be a fallback");
  }

  const shot = await page.screenshot({ type: "png" });

  /*
   * The phone's view, clipped out of the same render.
   *
   * This used to write the cover to a temporary file and reload it inside a
   * narrower page, and it produced a blank white rectangle: the file:// image
   * never loaded into a document made by setContent, and networkidle was happy
   * to report that nothing was still loading. A preview that is quietly blank
   * is worse than none, because it is the thing you were going to check the
   * cropping with.
   */
  const clipped = clip ? await page.screenshot({ type: "png", clip }) : null;

  await page.close();
  return { shot, clipped };
}

(async () => {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  const { shot: profile } = await draw(browser, {
    html: profileHtml, size: PROFILE, needsMark: true,
  });
  console.log(`  ok    profile drawn, ${PROFILE.w}x${PROFILE.h}`);

  /* What a phone keeps: the full height, the middle 1108 of the width. */
  const phoneClip = {
    x: (COVER.w - COVER_SAFE) / 2, y: 0, width: COVER_SAFE, height: COVER.h,
  };

  const { shot: cover, clipped: crop } = await draw(browser, {
    html: coverHtml, size: COVER, needsMark: true, needsType: true, clip: phoneClip,
  });
  console.log(`  ok    cover drawn, ${COVER.w}x${COVER.h}, safe width ${COVER_SAFE}`);
  console.log(`  ok    phone crop clipped, ${COVER_SAFE}x${COVER.h}`);

  /*
   * The two pieces assembled the way Facebook assembles them.
   *
   * Both files can be right on their own and wrong together: the avatar is
   * punched out of the cover as a circle and parked over its bottom left, so
   * the only way to know whether the ink cover and the paper avatar sit well
   * against each other is to look at them stacked. Drawn from the buffers
   * just rendered, as data URIs, because a file:// image never loads into a
   * document made by setContent and fails silently when it does not.
   */
  const asUri = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
  const { shot: together } = await draw(browser, {
    html: `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1640px; height: 900px; background: ${PAPER};
         font-family: "Instrument Sans", system-ui, sans-serif; }
  .cover { display: block; width: 1640px; height: 624px; }
  .bar { position: relative; height: 276px; }
  .pic {
    position: absolute; left: 72px; top: -112px;
    width: 336px; height: 336px; border-radius: 50%;
    border: 10px solid ${PAPER}; object-fit: cover;
  }
  .name { position: absolute; left: 452px; top: 36px; }
  h2 { font-family: "Anton", sans-serif; font-weight: 400; font-size: 54px;
       text-transform: uppercase; letter-spacing: .01em; color: ${INK}; }
  .meta { margin-top: 10px; font-size: 24px; color: ${MUTED}; }
</style></head>
<body>
  <img class="cover" src="${asUri(cover)}" alt="">
  <div class="bar">
    <img class="pic" src="${asUri(profile)}" alt="">
    <div class="name">
      <h2>Second Pair Ltd</h2>
      <div class="meta">Software company &middot; second-pair.com</div>
    </div>
  </div>
</body></html>`,
    size: { w: 1640, h: 900 },
    needsType: true,
  });
  console.log(`  ok    the pair drawn together`);

  await browser.close();

  const previews = [
    ["profile.png", profile],
    ["cover.png", cover],
    ["cover-as-a-phone-sees-it.png", crop],
    ["the-page-header.png", together],
  ];
  for (const [name, buf] of previews) {
    fs.writeFileSync(path.join(PREVIEW_DIR, name), buf);
  }
  console.log(`\n  previews: ${PREVIEW_DIR}`);

  if (!write) {
    console.log(`\n  Nothing saved into the repo. Run with --write to keep them.\n`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "facebook-profile.png"), profile);
  fs.writeFileSync(path.join(OUT_DIR, "facebook-cover.png"), cover);
  console.log(`\n  written into ${OUT_DIR}`);
  console.log(`  facebook-profile.png  ${Math.round(profile.length / 1024)}K`);
  console.log(`  facebook-cover.png    ${Math.round(cover.length / 1024)}K\n`);
})();
