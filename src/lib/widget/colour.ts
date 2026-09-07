/**
 * The two colours the widget is painted in, and whether they can be read.
 *
 * This rule existed three times and behaved differently in each: the panel
 * darkened a pale accent, the launcher button did not, and the settings page
 * described a behaviour it did not implement. One place now, so a business
 * cannot be shown a preview that lies about their own site.
 */

/** Six hex digits, however they were written. Null when it is not a colour. */
export function readHex(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#/, "").toLowerCase();

  // #fff is how most people write white, and every CSS example ever printed
  // uses it. Refusing it and calling it "not six characters" is our problem to
  // solve, not theirs.
  const expanded =
    cleaned.length === 3 && /^[0-9a-f]{3}$/.test(cleaned)
      ? cleaned.split("").map((c) => c + c).join("")
      : cleaned;

  return /^[0-9a-f]{6}$/.test(expanded) ? expanded : null;
}

type Rgb = { r: number; g: number; b: number };

function rgb(hex: string): Rgb {
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * How bright a colour looks, which is not how bright it is.
 *
 * Rec. 709 weights: green carries most of the perceived brightness, so a plain
 * average calls a bright green dark and puts white on it.
 */
function luminance({ r, g, b }: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast, 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const one = luminance(rgb(a));
  const two = luminance(rgb(b));
  const [light, dark] = one > two ? [one, two] : [two, one];
  return (light + 0.05) / (dark + 0.05);
}

const WHITE = "ffffff";
/** Not pure black: it reads as a hole punched in a colour rather than as ink. */
const INK = "17150f";

/**
 * The writing that reads best on a given button colour.
 *
 * Whichever of white and near-black has more contrast, which is exactly the
 * choice a person makes by eye and gets right.
 */
export function autoText(accent: string): string {
  return contrast(accent, WHITE) >= contrast(accent, INK) ? WHITE : INK;
}

export type Painted = {
  /** What the button is filled with. */
  fill: string;
  /** What is written on it. */
  text: string;
  /** WCAG ratio of the two, rounded to one decimal. */
  ratio: number;
  /**
   * Whether that ratio clears 4.5:1, the bar for text this size.
   *
   * Reported rather than enforced. It is their brand, and a business told
   * "no" by its own software will pick a colour it likes less and trust the
   * software less. Told "this will be hard to read", most people fix it.
   */
  readable: boolean;
};

/**
 * What the widget will actually look like.
 *
 * Both arguments are what the business has stored, either of which may be
 * missing: no accent means our navy, no text colour means work it out.
 */
export function paint(accent: string | null, text: string | null): Painted {
  const fill = (accent && readHex(accent)) || "14243f";
  const ink = (text && readHex(text)) || autoText(fill);
  const ratio = contrast(fill, ink);

  return {
    fill,
    text: ink,
    ratio: Math.round(ratio * 10) / 10,
    readable: ratio >= 4.5,
  };
}
