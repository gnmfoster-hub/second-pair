/**
 * What the colour of a diary entry means.
 *
 * Three answers, because three different businesses are looking at this:
 *
 *   category — what kind of thing it is. Right for one person who wants to see
 *              client work against admin and time off.
 *   client   — who it is for. Right for spotting a regular, and for a busy day
 *              that is all the same category anyway.
 *   person   — whose it is. The only readable answer for a salon in week view,
 *              where everybody's work shares one column per day.
 *
 * The palette is fixed and hand-picked rather than generated: hues spun off a
 * hash land wherever they land, and half of them fight a forest-green
 * interface or fail contrast on cream.
 */

export type ColourMode = "category" | "client" | "person";

/**
 * Twelve, distinguishable side by side, and all legible against both themes.
 * Deliberately excludes the brand's own forest and amber — those mean
 * "the app" and "act on this", and must not also mean "Tom".
 */
const PALETTE = [
  "#3d6ea8", // slate blue
  "#a8543d", // terracotta
  "#5b7f4a", // olive
  "#8a4f7d", // plum
  "#2f7f86", // teal
  "#a06a2c", // ochre
  "#6b5ba8", // violet
  "#a03d52", // wine
  "#3f7a6a", // pine
  "#8d6a3f", // bronze
  "#4a6fa8", // denim
  "#7d4a3d", // rust
];

/**
 * The same name always gets the same colour, in this studio and every other.
 *
 * Stable rather than positional: colouring by row order means everyone's
 * colour changes the moment somebody is added, which is worse than no colour
 * at all because the owner has already learned the old ones.
 */
export function colourForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/** Initials, for the corner of a card too small to carry a name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The colour an entry should take.
 *
 * Falls back to the category whenever the chosen mode has nothing to work
 * with — a block with no client, a solo business with nobody to distinguish.
 * A grey blank would be worse than the category colour it already had.
 */
export function hueFor(
  mode: ColourMode,
  entry: { clientName?: string | null; artistName?: string | null },
  categoryHue: string,
): string {
  if (mode === "client" && entry.clientName) return colourForName(entry.clientName);
  if (mode === "person" && entry.artistName) return colourForName(entry.artistName);
  return categoryHue;
}

export const COLOUR_MODES: { value: ColourMode; label: string; hint: string }[] = [
  { value: "category", label: "What it is", hint: "Client work, admin, time off" },
  { value: "client", label: "Who it's for", hint: "A colour per client" },
  { value: "person", label: "Whose it is", hint: "A colour per team member" },
];
