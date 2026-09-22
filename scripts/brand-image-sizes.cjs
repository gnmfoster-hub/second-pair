/*
 * The brand artwork, at sizes a phone should actually download.
 *
 * The pack supplies everything at print size and it was being served whole.
 * Measured at 390 wide, /home pulled 2.9MB, and 2.4MB of that was the logo:
 * a 1254px PNG for a mark drawn at 68 pixels, twice on every page because the
 * header and the footer each have one.
 *
 * Nothing here recolours or redraws anything, which is what the pack's rules
 * actually forbid. It resizes and re-encodes — the same kind of preparation as
 * knocking the ground out to alpha, which was already accepted.
 *
 * Each target is the largest the product ever draws that image, times three
 * for a dense screen, rounded up. Those numbers are in the comments beside
 * them so they can be checked rather than trusted.
 *
 *   node scripts/brand-image-sizes.cjs
 */
const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "..", "node_modules", "sharp"));

const PUBLIC = path.join(__dirname, "..", "public", "brand");

const JOBS = [
  /*
   * The mark. Largest use is 68px in the phone header, so 204 on a
   * three-times screen; 320 leaves room for a bigger placement later.
   */
  { from: "logo/mark-3d.png", to: "logo/mark-3d-320.webp", width: 320 },
  { from: "logo/mark-flat-reversed.png", to: "logo/mark-flat-reversed-320.webp", width: 320 },

  /*
   * The pointing hand in the hero. Drawn at 104px on a phone and 142 above
   * sm — see the img in Hero.tsx — so 426 at three times. 480 is the next
   * sensible step up, and the source is 1155, which is two and a half times
   * more than the densest screen can show.
   */
  { from: "hands/hand-type.webp", to: "hands/hand-type-480.webp", width: 480 },
  { from: "hands/hand-type-press.webp", to: "hands/hand-type-press-480.webp", width: 480 },

  /*
   * hand-front is deliberately absent. It is the hand holding the phone, drawn
   * at 194 per cent of the phone's width — on a wide screen that is over a
   * thousand pixels, and the source is only 700, so it is already being
   * enlarged. Shrinking it would show.
   */
];

(async () => {
  for (const job of JOBS) {
    const from = path.join(PUBLIC, job.from);
    const to = path.join(PUBLIC, job.to);

    const before = fs.statSync(from).size;
    await sharp(from)
      .resize(job.width, job.width, { fit: "inside", withoutEnlargement: true })
      /* Lossless is several times the size; at these display sizes 88 is invisible. */
      .webp({ quality: 88, effort: 6 })
      .toFile(to);
    const after = fs.statSync(to).size;

    console.log(
      `${job.from.padEnd(30)} ${String((before / 1024).toFixed(0)).padStart(5)}KB  ->  ` +
        `${job.to.padEnd(34)} ${String((after / 1024).toFixed(0)).padStart(4)}KB` +
        `   (${(100 - (after / before) * 100).toFixed(1)}% smaller)`,
    );
  }
})();
