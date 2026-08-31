/**
 * The Second Pair mark and lockup.
 *
 * The mark is drawn inline from the brand pack's own path so it can take theme
 * tokens — the pack ships separate files for light and dark, which cannot work
 * on a page that switches theme live. The tokens hold exactly the pack's
 * colour and reversed values, so it matches their files in each theme.
 *
 * The full lockup uses the pack's SVG files rather than setting the words in
 * live text. Their wordmark is Inter converted to outlines with the spacing
 * already right; live text at 11px was never going to look like a logo, and
 * did not.
 */

const BUBBLE =
  "M18 0h40a18 18 0 0 1 18 18v22a18 18 0 0 1-18 18H36l-20 16V58h-.5A17.5 17.5 0 0 1 0 40.5V18A18 18 0 0 1 18 0Z";

/** Dots knocked out rather than filled, for single-colour use. */
const KNOCKOUT =
  BUBBLE + "M26 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" + "M50 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z";

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
        <path d={KNOCKOUT} fillRule="evenodd" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 76 74" className={className} role="img" aria-label={title}>
      <path d={BUBBLE} fill="var(--logo-bubble)" />
      <circle cx="26" cy="28" r="7" fill="var(--logo-dot-1)" />
      {/* The amber dot is the one fixed point: it stays amber in both themes,
          because it is the accent the whole identity hangs on. */}
      <circle cx="50" cy="28" r="7" fill="var(--logo-dot-2)" />
    </svg>
  );
}

/**
 * The horizontal lockup, from the pack's own files.
 *
 * Both variants are rendered and CSS picks one, because the theme can change
 * after the page has loaded and a server-rendered choice would then be wrong.
 * The hidden one costs a request that the browser caches and never repeats.
 */
export function Logo({
  className = "",
  height = 26,
  tagline = false,
}: {
  className?: string;
  /** In pixels. Under 90 the pack says use the mark alone instead. */
  height?: number;
  /** The primary lockup, which carries "you work, we answer". Needs 180px. */
  tagline?: boolean;
}) {
  const light = tagline ? "/brand/svg/logo-primary.svg" : "/brand/svg/logo-horizontal.svg";
  const dark = tagline
    ? "/brand/svg/logo-primary-reversed.svg"
    : "/brand/svg/logo-horizontal-reversed.svg";

  return (
    <span className={`inline-block ${className}`} style={{ height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={light}
        alt="Second Pair"
        style={{ height }}
        className="w-auto dark-hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dark}
        alt=""
        aria-hidden="true"
        style={{ height }}
        className="w-auto light-hidden"
      />
    </span>
  );
}
