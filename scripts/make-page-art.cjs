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
 * THE COVER: the conversation.
 *
 * Giles, on three earlier attempts: "it crys web designer and software
 * company." He was right. Big condensed type on cream beside an abstract
 * graphic is the house style of every design studio and every B2B startup,
 * it said nothing about what the product does, and the people who land on
 * this Page are tattooists, cleaners and dog walkers rather than anybody who
 * buys software.
 *
 * So the cover shows the product working instead of claiming anything: a
 * customer asked at nine at night on a Sunday and got an answer. That is the
 * whole business in one picture, read in about a second with no marketing
 * language in it, and no agency has a booking exchange on its cover.
 *
 * It is also the mark unpacked. The logo is a speech bubble with two hands in
 * it, so a cover built from speech bubbles, with the blue hand having just
 * sent the second one, is the brand saying its own name. The finger is lined
 * up to land on the message it sent.
 *
 * The words in the bubbles are an example, the same way the demo on the site
 * is an example. Nothing here is a real customer.
 *
 * Everything that makes it look built rather than assembled is in four
 * places, and all four are large enough to survive the 820x312 downsample:
 *
 *   the ground    a wide radial warmth rather than one flat cream. A flat
 *                 fill is the fastest way to look like a template.
 *   the hand      a real cast shadow. drop-shadow follows the alpha of a
 *                 cut-out, so the shadow is hand-shaped and the hand sits in
 *                 the picture rather than on top of it. This is the single
 *                 biggest difference between this and the version before it.
 *   the bubbles   depth, and a coloured shadow under the blue one so it
 *                 glows the way a sent message does on a screen.
 *   the tails     one squared corner each, pointing the right way, which is
 *                 what makes them read as messages and not rounded boxes.
 */
const coverHtml = `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${COVER.w}px; height: ${COVER.h}px; color: ${INK};
    font-family: "Instrument Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative; overflow: hidden;
    background:
      radial-gradient(1150px 720px at 26% 32%, #fdfbf6 0%, #f8f4ea 58%, #f1ecdf 100%);
  }
  /*
   * Held 50px clear of the safe band so nothing touches the frame edge when
   * a phone crops to the middle 68 per cent.
   */
  .col {
    position: absolute;
    left: ${(COVER.w - COVER_SAFE) / 2 + 50}px;
    top: 180px; width: 720px;
  }
  .time {
    font-family: "Anton", sans-serif; font-weight: 400; text-transform: uppercase;
    font-size: 44px; letter-spacing: 0.04em; color: #a8a28f; margin-bottom: 22px;
  }
  .bub {
    font-size: 34px; line-height: 1.3; padding: 23px 33px; border-radius: 30px;
    display: inline-block; max-width: 660px; font-weight: 500;
  }
  .them {
    background: #eae4d6; border-bottom-left-radius: 10px;
    box-shadow: 0 3px 16px rgba(22, 21, 15, 0.07);
  }
  .us {
    background: ${COBALT}; color: #fff; border-bottom-right-radius: 10px;
    margin-top: 18px; margin-left: 58px;
    box-shadow: 0 10px 30px rgba(42, 69, 240, 0.3);
  }
  /*
   * Bleeding off the bottom right. The shadow is thrown up and to the left,
   * against the light the photograph was lit with, so it agrees with the
   * highlights already on the hand.
   */
  .hand {
    position: absolute; right: -40px; bottom: -180px; height: 672px;
    transform: rotate(-14deg);
    filter: drop-shadow(-30px 26px 42px rgba(22, 21, 15, 0.26));
  }
</style></head>
<body>
  <img class="hand" src="${SITE}/brand/hands/hand-type.png" alt="">
  <div class="col">
    <div class="time">Sunday, 9:47pm</div>
    <div class="bub them">Are you free Friday for a cut?</div><br>
    <div class="bub us">Friday 10am is free. Shall I book it in?</div>
  </div>
</body></html>`;


/*
 * THE COVER: the product, on ink.
 *
 * Giles: "not sure about the hands or the small and devon sentence, come on
 * does this really look like an impressive facebook page." No, it did not,
 * and two of the three objections were mine to have caught.
 *
 * "A small software company in Devon" is good copy on /work, where modesty
 * reads as honesty next to a page of real clients. On a cover meant to
 * impress it opens with "small" and a county, and undersells the company to
 * somebody who has never heard of it. Replaced with the line from /apps,
 * word for word, which is concrete and says something worth hearing.
 *
 * The hands are gone from here. They are the right mark and they are on the
 * avatar sitting directly underneath, and two cut-out hands on cream is not
 * what a software company's page looks like. Cream plus black condensed type
 * is also the house style of every design studio, which is the thing he
 * objected to in the first place and which I kept returning to.
 *
 * What is actually impressive, and had never been used anywhere: the
 * software. Ink ground, a cobalt glow behind the panel so the screen reads
 * as lit rather than pasted on, and the real Reports page bleeding off the
 * right edge. That is what a tech company's page looks like, and unlike a
 * slogan it is evidence.
 *
 * ONE THING TO KNOW. The figures on it are the demo salon's, and the site
 * says in as many words that the demo's money is made up. This is the same
 * screenshot already published on /company and /system, it is the product's
 * own dashboard rather than a claim about a client, and nothing is
 * attributed to anybody. Flagged for Giles rather than decided quietly,
 * because inventing numbers is the one thing this brand does not do. If he
 * would rather no money showed, move the crop right and the two cards left
 * are "median first reply" and "enquiries, arrived out of hours".
 *
 * The diary was tried first for exactly that reason and was worse: most of
 * a month's cells are empty, so it reads as an empty diary, which is the
 * opposite of what is being sold.
 */
const coverServicesHtml = `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${COVER.w}px; height: ${COVER.h}px; background: #0a0b12; color: #f7f4ec;
    font-family: "Instrument Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative; overflow: hidden;
  }
  /* Behind the panel, so the screen looks lit rather than stuck on. */
  .glow {
    position: absolute; inset: 0;
    background:
      radial-gradient(760px 620px at 74% 52%, rgba(42, 69, 240, 0.42), transparent 68%),
      radial-gradient(900px 700px at 12% 18%, rgba(129, 148, 255, 0.10), transparent 70%);
  }
  .col {
    position: absolute; z-index: 3;
    left: ${(COVER.w - COVER_SAFE) / 2 + 50}px;
    top: 148px; width: 540px;
  }
  h1 {
    font-family: "Anton", sans-serif; font-weight: 400; text-transform: uppercase;
    font-size: 74px; line-height: 0.95; letter-spacing: 0.012em;
  }
  h1 span { color: #8194ff; }
  p {
    margin-top: 22px; font-size: 27px; line-height: 1.4;
    color: rgba(247, 244, 236, 0.74); font-weight: 500;
  }
  /* The real Reports page, cropped past the sidebar and bled off the edge. */
  .app {
    position: absolute; z-index: 2; right: -150px; top: 74px;
    width: 860px; height: 482px; overflow: hidden; border-radius: 18px;
    border: 1px solid rgba(247, 244, 236, 0.14);
    box-shadow: 0 40px 90px rgba(0, 0, 0, 0.6), 0 0 120px rgba(42, 69, 240, 0.3);
  }
  .app img { position: absolute; width: 1520px; left: -300px; top: -272px; }
</style></head>
<body>
  <div class="glow"></div>
  <div class="app"><img src="${SITE}/shots/report.webp" alt=""></div>
  <div class="col">
    <h1>We answer.<br>We build.<br><span>We look after it.</span></h1>
    <p>Answering real enquiries for real businesses every day, including at three in the morning.</p>
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
    html: coverServicesHtml, size: COVER, needsMark: true, needsType: true, clip: phoneClip,
  });
  /* Kept as an alternative, and as a post in its own right. */
  const { shot: coverTalk } = await draw(browser, {
    html: coverHtml, size: COVER, needsMark: true, needsType: true,
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
  body { width: 1640px; height: 900px; background: #1c1c1d;
         font-family: "Instrument Sans", system-ui, sans-serif; }
  .cover { display: block; width: 1640px; height: 624px; border-radius: 0 0 10px 10px; }
  /*
   * Corrected against the live Page on 11 October.
   *
   * This mock used to park the avatar over the bottom left of the cover,
   * which is the old Facebook layout and is what I showed Giles. The current
   * one sits it BELOW the cover with a gap, touching nothing. Showing him a
   * preview that did not match what he would get is how two rounds of this
   * got spent on the wrong problem.
   */
  .bar { position: relative; height: 276px; background: #1c1c1d; }
  .pic {
    position: absolute; left: 44px; top: 28px;
    width: 232px; height: 232px; border-radius: 50%;
    object-fit: cover;
  }
  .name { position: absolute; left: 320px; top: 56px; }
  h2 { font-family: "Anton", sans-serif; font-weight: 400; font-size: 54px;
       text-transform: uppercase; letter-spacing: .01em; color: #e4e6eb; }
  .meta { margin-top: 10px; font-size: 24px; color: #b0b3b8; }
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
    ["cover-alternative-the-conversation.png", coverTalk],
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
  fs.writeFileSync(path.join(OUT_DIR, "facebook-cover-conversation.png"), coverTalk);
  console.log(`\n  written into ${OUT_DIR}`);
  console.log(`  facebook-profile.png  ${Math.round(profile.length / 1024)}K`);
  console.log(`  facebook-cover.png    ${Math.round(cover.length / 1024)}K\n`);
})();
