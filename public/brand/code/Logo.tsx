type Variant = "colour" | "reversed" | "mono";

const FILL: Record<Variant, { bubble: string; dot1: string; dot2: string }> = {
  colour: { bubble: "#1E5647", dot1: "#F4F2EC", dot2: "#E8A33D" },
  reversed: { bubble: "#F4F2EC", dot1: "#1E5647", dot2: "#E8A33D" },
  mono: { bubble: "currentColor", dot1: "", dot2: "" },
};

const BUBBLE =
  "M18 0h40a18 18 0 0 1 18 18v22a18 18 0 0 1-18 18H36l-20 16V58h-.5A17.5 17.5 0 0 1 0 40.5V18A18 18 0 0 1 18 0Z";
const KNOCKOUT =
  BUBBLE +
  "M26 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" +
  "M50 21a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z";

export function SecondPairMark({
  variant = "colour",
  className,
  title = "Second Pair",
}: {
  variant?: Variant;
  className?: string;
  title?: string;
}) {
  const c = FILL[variant];
  return (
    <svg viewBox="0 0 76 74" className={className} role="img" aria-label={title}>
      {variant === "mono" ? (
        <path d={KNOCKOUT} fillRule="evenodd" fill="currentColor" />
      ) : (
        <>
          <path d={BUBBLE} fill={c.bubble} />
          <circle cx="26" cy="28" r="7" fill={c.dot1} />
          <circle cx="50" cy="28" r="7" fill={c.dot2} />
        </>
      )}
    </svg>
  );
}

export function SecondPairLogo({
  variant = "colour",
  tagline,
  className,
}: {
  variant?: Variant;
  tagline?: string;
  className?: string;
}) {
  const text =
    variant === "reversed" ? "#F4F2EC" : variant === "mono" ? "currentColor" : "#1E5647";
  const sub = variant === "reversed" ? "#9FBFB2" : "#6E7F76";
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: "0.5em" }}>
      <SecondPairMark variant={variant} className="h-[1.6em] w-auto" />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span style={{ color: text, letterSpacing: "-0.02em", fontWeight: 400 }}>
          second <strong style={{ fontWeight: 500 }}>pair</strong>
        </span>
        {tagline ? (
          <span style={{ color: sub, fontSize: "0.44em", letterSpacing: 0 }}>{tagline}</span>
        ) : null}
      </span>
    </span>
  );
}
