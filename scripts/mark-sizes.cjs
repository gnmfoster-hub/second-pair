/*
 * The mark, at a size a phone should actually download.
 *
 * The pack supplies the mark as a 1254px PNG and it was being served whole:
 * 935KB for the reversed one and 296KB for the paper one, twice each on every
 * page because the header and the footer both draw it. Measured on a phone,
 * /home pulled 2.9MB and 2.4MB of that was the logo — for artwork drawn at
 * 68 pixels.
 *
 * Nothing here recolours or redraws anything, which the pack's rules forbid.
 * It resizes and re-encodes, which is the same preparation already done when
 * the ground was knocked out to alpha.
 *
 * 320px covers every use: the largest the mark is ever drawn is 68px in the
 * phone header, which is 204 on a three-times screen.
 *
 *   node scripts/mark-sizes.cjs
 */
const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "..", "node_modules", "sharp"));

const DIR = path.join(__dirname, "..", "public", "brand", "logo");
const WIDTH = 320;

/* Only the two the product actually draws. The rest of the pack stays as it is. */
const FILES = ["mark-3d.png", "mark-flat-reversed.png"];

(async () => {
  for (const file of FILES) {
    const from = path.join(DIR, file);
    const to = path.join(DIR, file.replace(/\.png$/, `-${WIDTH}.webp`));

    const before = fs.statSync(from).size;
    await sharp(from)
      .resize(WIDTH, WIDTH, { fit: "inside", withoutEnlargement: true })
      /* Lossless would be 90KB; at 88 the difference is invisible at 68px. */
      .webp({ quality: 88, effort: 6 })
      .toFile(to);
    const after = fs.statSync(to).size;

    console.log(
      `${file.padEnd(26)} ${(before / 1024).toFixed(0)}KB  ->  ` +
        `${path.basename(to).padEnd(30)} ${(after / 1024).toFixed(0)}KB` +
        `   (${(100 - (after / before) * 100).toFixed(1)}% smaller)`,
    );
  }
})();
