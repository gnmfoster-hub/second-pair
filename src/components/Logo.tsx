/**
 * The Second Pair mark and lockups, from the locked V3 pack.
 *
 * The mark is the pack's own artwork — a navy speech bubble holding a cream
 * front hand and an orange one behind it. It is supplied as a raster image and
 * the pack is explicit that it must not be redrawn, reinterpreted or
 * regenerated, so it is used as an image rather than traced into paths. That
 * is a real constraint and the right one: the hands are the identity.
 *
 * Everything around it is live text. The pack ships lockups with the wordmark
 * converted to outlines, which is right for print and wrong here for two
 * reasons: each file is a base64 PNG inside an SVG weighing about 380KB, and a
 * page that switches theme after loading cannot swap a baked-in ink colour.
 * The pack also gives the exact type specification — Inter, "second" at 400,
 * "pair" at 500, tracking -0.02em — so setting it live reproduces their
 * artwork rather than departing from it, at a fortieth of the weight and crisp
 * at any size.
 *
 * The mark needs no reversed variant: the pack's own reversed lockups keep the
 * navy bubble unchanged and lighten only the words.
 */

/** Every size shipped, so the browser can pick for the display it is on. */
const MARK_SIZES = [32, 48, 64, 96, 128, 192, 256] as const;

const SRCSET = MARK_SIZES.map((s) => `/brand/mark/mark-${s}.png ${s}w`).join(", ");

/** The smallest shipped size that still covers what is being asked for. */
function nearest(wanted: number): number {
  return MARK_SIZES.find((s) => s >= wanted) ?? MARK_SIZES[MARK_SIZES.length - 1];
}

export function Mark({
  className = "size-7",
  title = "Second Pair",
  /**
   * Roughly how wide it will be drawn, so the browser fetches a sensible file
   * rather than the largest. A hint only; the CSS still decides.
   */
  sizePx = 28,
}: {
  className?: string;
  title?: string;
  sizePx?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/mark/mark-${nearest(sizePx * 2)}.png`}
      srcSet={SRCSET}
      sizes={`${sizePx}px`}
      alt={title}
      className={className}
      /*
       * Given a width and height so the row does not jump while it loads. The
       * artwork is square: the mark is trimmed to its bounding box and centred
       * on a square canvas when the sizes are generated.
       */
      width={sizePx}
      height={sizePx}
      decoding="async"
    />
  );
}

/**
 * Which arrangement.
 *
 * The names are the ones the app already calls for. The pack has fewer
 * arrangements than the old one, so several map onto the same thing rather
 * than every caller in the codebase changing for no visible reason.
 */
export type Lockup =
  /** Mark, name, and the tagline sitting under the name's right edge. */
  | "flush-right"
  /** Mark and name only, for anywhere a tagline would be too small to read. */
  | "horizontal"
  | "inline"
  | "classic"
  | "lead-in"
  /** Mark above the name. For narrow columns and square spaces. */
  | "stacked";

export type Tagline =
  /** "you work, we answer" — the product and the company. */
  | "default"
  /** "answers while you're on the job" — trades-facing pages only. */
  | "trades"
  /** "your second pair of hands" — introductions and launch material. */
  | "hands";

const TAGLINES: Record<Tagline, string> = {
  default: "you work, we answer",
  trades: "answers while you're on the job",
  hands: "your second pair of hands",
};

/**
 * The lockup, composed rather than fetched.
 *
 * Height is the whole lockup's height, which is how every caller already asks
 * for it. The mark is sized from that and the type from the mark, so the
 * proportions hold at 20px in a mobile bar and at 56px on a sign-in screen.
 */
export function Logo({
  className = "",
  height = 26,
  lockup = "horizontal",
  tagline = "default",
  /** Kept for callers written against the old pack's trades line. */
  altLine = false,
}: {
  className?: string;
  height?: number;
  lockup?: Lockup;
  tagline?: Tagline;
  altLine?: boolean;
}) {
  const line: Tagline = altLine ? "trades" : tagline;
  const stacked = lockup === "stacked";

  /*
   * A tagline needs room to be read.
   *
   * The pack sets 180px as the minimum width for a lockup carrying one, which
   * at these proportions is around 30px of height. Below that it is dropped
   * rather than shrunk into decoration: an unreadable tagline is worse than no
   * tagline, and the pack forbids the first.
   */
  const showTagline =
    (lockup === "flush-right" || lockup === "classic" || stacked) && height >= 30;

  if (stacked) {
    return (
      <span className={`inline-flex flex-col items-center gap-1.5 ${className}`}>
        <Mark className="block" sizePx={Math.round(height * 0.52)} />
        <span className="flex flex-col items-center leading-none">
          <Wordmark size={Math.round(height * 0.26)} />
          {showTagline && <Tag size={Math.round(height * 0.14)} text={TAGLINES[line]} />}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-[0.34em] ${className}`} style={{ height }}>
      <Mark className="block shrink-0" sizePx={Math.round(height * (showTagline ? 0.88 : 0.96))} />
      {/*
        * Flush right: the tagline ends level with the name rather than
        * starting under its beginning, so the two read as one block instead of
        * two things that happen to be near each other. It is the arrangement
        * the pack uses in its own lockup-default.
        */}
      <span className="flex flex-col items-end leading-none">
        <Wordmark size={Math.round(height * (showTagline ? 0.44 : 0.5))} />
        {showTagline && <Tag size={Math.round(height * 0.22)} text={TAGLINES[line]} />}
      </span>
    </span>
  );
}

/** "second pair", at the pack's weights and tracking. */
function Wordmark({ size }: { size: number }) {
  return (
    <span
      className="wordmark whitespace-nowrap text-foreground"
      style={{ fontSize: size, lineHeight: 1.05 }}
    >
      second <span className="font-medium">pair</span>
    </span>
  );
}

/**
 * The tagline, in muted rather than orange.
 *
 * The pack is explicit that orange must never carry small text on a light
 * ground. Muted is what its own lockups use, and unlike a baked-in colour it
 * follows the theme.
 */
function Tag({ size, text }: { size: number; text: string }) {
  return (
    <span
      className="wordmark whitespace-nowrap text-muted"
      style={{ fontSize: size, lineHeight: 1.2, marginTop: size * 0.3 }}
    >
      {text}
    </span>
  );
}
