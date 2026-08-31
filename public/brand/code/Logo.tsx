type Variant = "colour" | "reversed" | "mono";
type Layout = "classic" | "flushRight" | "inline" | "leadIn" | "stacked" | "none";

const BUBBLE =
  "M18 0h40a18 18 0 0 1 18 18v22a18 18 0 0 1-18 18H36l-20 16V58h-.5A17.5 17.5 0 0 1 0 40.5V18A18 18 0 0 1 18 0Z";
const HOLES =
  "M26 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM50 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z";

const C = {
  navy: "#14243F",
  orange: "#F07818",
  paper: "#EFEEE9",
  muted: "#5A6577",
  mutedDark: "#9BAAC2",
};

export function SecondPairMark({
  variant = "colour",
  className,
  label = "Second Pair",
}: {
  variant?: Variant;
  className?: string;
  label?: string;
}) {
  if (variant === "mono") {
    return (
      <svg viewBox="0 0 76 74" className={className} role="img" aria-label={label}>
        <path d={BUBBLE + HOLES} fillRule="evenodd" fill="currentColor" />
      </svg>
    );
  }
  const bubble = variant === "reversed" ? C.paper : C.navy;
  const dot1 = variant === "reversed" ? C.navy : C.paper;
  return (
    <svg viewBox="0 0 76 74" className={className} role="img" aria-label={label}>
      <path d={BUBBLE} fill={bubble} />
      <circle cx="26" cy="28" r="7" fill={dot1} />
      <circle cx="50" cy="28" r="7" fill={C.orange} />
    </svg>
  );
}

/**
 * Tagline is a prop, not baked in, so it can change per audience.
 * Pass tagline={null} for the header and anywhere under 180px wide.
 */
export function SecondPairLogo({
  variant = "colour",
  layout = "classic",
  tagline = "you work, we answer",
  className,
}: {
  variant?: Variant;
  layout?: Layout;
  tagline?: string | null;
  className?: string;
}) {
  const text = variant === "reversed" ? C.paper : variant === "mono" ? "currentColor" : C.navy;
  const sub = variant === "reversed" ? C.mutedDark : C.muted;
  const showTag = layout !== "none" && !!tagline;

  const Name = (
    <span style={{ color: text, letterSpacing: "-0.02em", fontWeight: 400, whiteSpace: "nowrap" }}>
      second <strong style={{ fontWeight: 500 }}>pair</strong>
    </span>
  );
  const Tag = showTag ? (
    <span style={{ color: sub, fontSize: "0.44em", letterSpacing: 0, whiteSpace: "nowrap" }}>
      {tagline}
    </span>
  ) : null;

  if (layout === "stacked") {
    return (
      <span className={className} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "0.35em" }}>
        <SecondPairMark variant={variant} className="h-[2em] w-auto" />
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
          {Name}
          {Tag}
        </span>
      </span>
    );
  }

  if (layout === "inline") {
    return (
      <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: "0.5em" }}>
        <SecondPairMark variant={variant} className="h-[1.5em] w-auto" />
        {Name}
        {showTag ? (
          <>
            <span aria-hidden style={{ width: 1, height: "1.1em", background: sub, opacity: 0.45 }} />
            {Tag}
          </>
        ) : null}
      </span>
    );
  }

  const align =
    layout === "flushRight" ? "flex-end" : "flex-start";
  const order = layout === "leadIn" ? "column-reverse" : "column";

  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: "0.5em" }}>
      <SecondPairMark variant={variant} className="h-[1.6em] w-auto" />
      <span style={{ display: "flex", flexDirection: order, alignItems: align, lineHeight: 1.15 }}>
        {Name}
        {Tag}
      </span>
    </span>
  );
}
