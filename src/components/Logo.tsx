/**
 * The Second Pair mark and lockup.
 *
 * Adapted from the supplied brand pack so the colours come from theme tokens
 * rather than being hard-coded: the pack ships separate files for light and
 * dark, which cannot work in a page that switches theme live. The tokens are
 * set to exactly the pack's colour and reversed values in globals.css, so the
 * result is identical to their files in each theme.
 *
 * The mark is a speech bubble with two dots — the typing indicator everybody
 * recognises, and there being two of them is the pair.
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
 * Mark plus words.
 *
 * The pack's wordmark files are Inter converted to outlines. This sets it in
 * live text instead, to the pack's own spec — Inter, "second" at 400 and
 * "pair" at 500, tracking -0.02em — so it stays selectable, scales with the
 * surrounding type and needs no image request.
 */
export function Logo({
  className = "",
  tagline,
  markClass = "size-7",
}: {
  className?: string;
  /** The pack's line is "you work, we answer". Omit it under 180px wide. */
  tagline?: string;
  markClass?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className={`${markClass} shrink-0`} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="wordmark text-[0.95rem]">
          second <span className="font-medium">pair</span>
        </span>
        {tagline && (
          <span className="truncate text-[0.68rem] text-muted">{tagline}</span>
        )}
      </span>
    </span>
  );
}
