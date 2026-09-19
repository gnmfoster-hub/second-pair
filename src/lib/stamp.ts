/**
 * How a particular stamp sits, worked out from what it is stamped on.
 *
 * The status badges are drawn as rubber stamps, and a rubber stamp pressed by
 * a person is never quite straight and never quite evenly inked. A column of
 * identical rectangles all leaning the same way is a graphic; a column leaning
 * slightly differently is a hand, and that difference is the entire point of
 * the effect.
 *
 * Derived from the row's id rather than random, for two reasons. A given
 * stamp should be at the same angle every time the page is drawn, or the list
 * twitches on every render and every screenshot is a different picture. And it
 * has to be worked out the same way on the server and in the browser, or React
 * reports a mismatch on every row.
 */

/**
 * A small, stable number from a string. Not a good hash and does not need to
 * be one: it needs to be the same everywhere and to vary between neighbours.
 */
function seedOf(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  return n;
}

export type Stamped = { "--tilt": string; "--ink": string };

/**
 * The CSS custom properties for one stamp.
 *
 * Tilt lands between -1.4 and +1.4 degrees, which is visible when you look at
 * it and never reads as broken alignment — and is small enough that it cannot
 * change the height of the row it sits in.
 *
 * Ink varies only between 0.88 and 1. Any more and the faint ones look like a
 * loading state rather than like ink.
 */
export function stampStyle(id: string): Stamped {
  const seed = seedOf(id);
  const tilt = ((seed % 29) / 28) * 2.8 - 1.4;
  const ink = 0.88 + ((Math.floor(seed / 29) % 13) / 12) * 0.12;

  return {
    "--tilt": `${tilt.toFixed(2)}deg`,
    "--ink": ink.toFixed(3),
  };
}
