/**
 * The Second Pair mark and lockups.
 *
 * The mark is drawn inline from the pack's own path so it can take theme
 * tokens — the pack ships separate files for light and dark, which cannot work
 * on a page that switches theme live. The tokens hold exactly the pack's
 * colour and reversed values, so it matches their files in each theme.
 *
 * The lockups use the pack's SVG files. Their wordmark is Inter converted to
 * outlines with the spacing already right, and live text at 11px was never
 * going to look like a logo.
 *
 * Flush right is the pack's recommendation for the site: the tagline ends
 * level with the name, so the whole thing reads as one block rather than two
 * things that happen to be near each other.
 */

const BUBBLE =
  "M18 0h40a18 18 0 0 1 18 18v22a18 18 0 0 1-18 18H36l-20 16V58h-.5A17.5 17.5 0 0 1 0 40.5V18A18 18 0 0 1 18 0Z";

/** Dots knocked out rather than filled, for single-colour use. */
const HOLES = "M26 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM50 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z";

export function Mark({
  className = "size-7",
  mono = false,
  title = "Second Pair",
}: {
  className?: string;
  /** One colour, taking currentColor. For print, and anywhere on a photo. */
  mono?: boolean;
  title?: string;
}) {
  if (mono) {
    return (
      <svg viewBox="0 0 76 74" className={className} role="img" aria-label={title}>
        <path d={BUBBLE + HOLES} fillRule="evenodd" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 76 74" className={className} role="img" aria-label={title}>
      <path d={BUBBLE} fill="var(--logo-bubble)" />
      <circle cx="26" cy="28" r="7" fill="var(--logo-dot-1)" />
      {/* Orange in both themes. It is the fixed point the identity hangs on. */}
      <circle cx="50" cy="28" r="7" fill="var(--logo-dot-2)" />
    </svg>
  );
}

/** Which arrangement, per the pack's own guidance on where each belongs. */
export type Lockup =
  | "flush-right"
  | "classic"
  | "inline"
  | "lead-in"
  | "stacked"
  | "horizontal";

export function Logo({
  className = "",
  height = 26,
  lockup = "horizontal",
  /** The trades-facing line, "answers while you're on the job". */
  altLine = false,
}: {
  className?: string;
  /** In pixels. A lockup with a tagline needs 180px of width; under 90px use the mark. */
  height?: number;
  lockup?: Lockup;
  altLine?: boolean;
}) {
  // Only classic and flush-right ship an alternative tagline.
  const suffix = altLine && (lockup === "classic" || lockup === "flush-right")
    ? "-alt-line"
    : "";

  const base =
    lockup === "horizontal" ? "logo-horizontal" : `lockup-${lockup}${suffix}`;

  /*
   * Both variants render and CSS picks one, because the theme can change after
   * the page has loaded and a server-rendered choice would then be wrong. The
   * hidden one costs a request the browser caches and never repeats.
   *
   * The reversed files have no -alt-line, so that falls back to the plain one.
   */
  const reversed =
    lockup === "horizontal" ? "logo-horizontal-reversed" : `lockup-${lockup}-reversed`;

  return (
    <span className={`inline-block ${className}`} style={{ height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/svg/${base}.svg`}
        alt="Second Pair"
        style={{ height }}
        className="w-auto dark-hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/svg/${reversed}.svg`}
        alt=""
        aria-hidden="true"
        style={{ height }}
        className="w-auto light-hidden"
      />
    </span>
  );
}
