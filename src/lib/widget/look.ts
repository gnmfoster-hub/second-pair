/**
 * Everything about how the launcher is drawn, decided in one place.
 *
 * The script that draws it runs on somebody else's website and cannot be
 * changed without a deploy; the settings page has to show the same thing
 * without running that script. So the numbers live here, are sent down with
 * the status, and both ends read them rather than each holding an opinion.
 *
 * That is not a tidiness argument. The preview and the site disagreed about
 * pale colours for weeks, and the person it lied to was the one choosing.
 */

export type Shape = "round" | "soft" | "square";
export type Size = "small" | "medium" | "large";
export type Bubble = "light" | "dark";

/**
 * Whether the button asks to be looked at.
 *
 * `once` rings twice as the nudge appears, at the moment there is something to
 * read. `always` keeps going for a business who wants it noticed on a busy
 * page — and stops on its own, because a button pulsing at somebody for the
 * twenty minutes they spend reading is no longer a signal, it is a nuisance
 * they will remember the business for.
 */
export type Pulse = "off" | "once" | "always";

export const SHAPES: Shape[] = ["round", "soft", "square"];
export const SIZES: Size[] = ["small", "medium", "large"];
export const BUBBLES: Bubble[] = ["light", "dark"];
export const PULSES: Pulse[] = ["off", "once", "always"];

export function isShape(v: unknown): v is Shape {
  return typeof v === "string" && (SHAPES as string[]).includes(v);
}
export function isSize(v: unknown): v is Size {
  return typeof v === "string" && (SIZES as string[]).includes(v);
}
export function isBubble(v: unknown): v is Bubble {
  return typeof v === "string" && (BUBBLES as string[]).includes(v);
}
export function isPulse(v: unknown): v is Pulse {
  return typeof v === "string" && (PULSES as string[]).includes(v);
}

/**
 * How the repeating pulse behaves, in numbers the script can just obey.
 *
 * `every` is deliberately long. A ring every second is a fire alarm; every six
 * is something happening in the corner of an eye that a person can ignore
 * while they read, and notice when they look up.
 *
 * `until` is the part that matters. It stops after two minutes whatever
 * happens, and the script stops it sooner the moment somebody opens the chat
 * or waves the nudge away — by then they have seen it, and carrying on is
 * saying the same thing to somebody who has already answered.
 */
export type PulsePlan = { rings: number; every: number; until: number };

export function pulsePlan(pulse: Pulse): PulsePlan | null {
  if (pulse === "off") return null;
  if (pulse === "once") return { rings: 2, every: 0, until: 0 };
  return { rings: 2, every: 6000, until: 120000 };
}

export type Geometry = {
  /** Button height and, when there is nothing to say, its width. */
  height: number;
  /** CSS length. A pill, a rounded rectangle, or nearly a square. */
  radius: string;
  /** The mark inside it, which has to shrink with the button. */
  icon: number;
  /** Type size on the button. Below about 12.5px a label stops being read. */
  font: number;
  /** Horizontal padding when it is wide enough to carry a line of text. */
  padding: number;
};

const HEIGHTS: Record<Size, number> = { small: 46, medium: 56, large: 66 };

/**
 * The shape, as a radius rather than a name.
 *
 * "Square" is 8px, not 0. A true right angle on a floating element reads as an
 * unstyled div that somebody forgot, and every site with square buttons still
 * softens them by a pixel or two.
 */
function radiusFor(shape: Shape): string {
  if (shape === "round") return "999px";
  if (shape === "soft") return "16px";
  return "8px";
}

export function geometry(size: Size, shape: Shape): Geometry {
  const height = HEIGHTS[size];
  return {
    height,
    radius: radiusFor(shape),
    icon: Math.round(height * 0.43),
    // Held between 12.5 and 14.5: the button is small and the line on it is
    // the one piece of writing that has to be read from the corner of an eye.
    font: Math.min(14.5, Math.max(12.5, Math.round(height * 0.25 * 2) / 2)),
    padding: size === "small" ? 14 : size === "large" ? 22 : 18,
  };
}

export type BubbleColours = { fill: string; text: string; shadow: string };

/** The nudge, in the two flavours a website comes in. */
export function bubbleColours(bubble: Bubble): BubbleColours {
  return bubble === "dark"
    ? {
        fill: "#1b2029",
        text: "#f2f4f8",
        shadow: "0 8px 28px rgba(0, 0, 0, 0.45)",
      }
    : {
        fill: "#ffffff",
        text: "#16181d",
        shadow: "0 8px 28px rgba(10, 12, 16, 0.18)",
      };
}

/**
 * The line on the button, with the business's own words when they have any.
 *
 * `computed` is what the hours say, and it is right for almost everybody: it
 * is true, it changes through the day, and it is not a slogan. An override is
 * for a business whose voice is its own — and it is trusted, including when it
 * is a worse line than ours. It is their sign.
 *
 * Trimmed and capped, because it is drawn on a 56 pixel button next to a live
 * dot, and a sentence there is not a sentence, it is a smear.
 */
export function lineFor(
  computed: string,
  open: boolean,
  overrides: { open?: string | null; closed?: string | null },
): string {
  const chosen = open ? overrides.open : overrides.closed;
  const said = chosen?.trim();
  return said ? said.slice(0, 48) : computed;
}
