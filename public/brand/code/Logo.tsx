/*
 * The brand pack author's handoff sample. Not used by the app, and it no
 * longer works: it loads `svg/` files that have been deleted, because the
 * navy/cream/orange two-hands brand it draws is not the brand any more.
 *
 * Left as written rather than repointed, because it is somebody else's
 * deliverable and rewriting it would make it look maintained. The component
 * the site actually uses is `src/components/Logo.tsx`.
 */
import type { CSSProperties, ImgHTMLAttributes } from "react";

type Tagline = "default" | "trades" | "hands" | "none";
type Layout = "horizontal" | "stacked";
type Theme = "light" | "dark";

export type SecondPairLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  tagline?: Tagline;
  layout?: Layout;
  theme?: Theme;
  assetBase?: string;
};

const TAGLINES = {
  default: "you work, we answer",
  trades: "answers while you're on the job",
  hands: "your second pair of hands",
} as const;

export function SecondPairLogo({
  tagline = "default",
  layout = "horizontal",
  theme = "light",
  assetBase = "/brand",
  style,
  ...props
}: SecondPairLogoProps) {
  const reversed = theme === "dark" ? "-reversed" : "";
  let filename: string;

  if (tagline === "none") {
    filename = `logo-horizontal${reversed}.svg`;
  } else if (layout === "stacked") {
    filename = `lockup-stacked-${tagline}${reversed}.svg`;
  } else {
    filename = `lockup-${tagline}${reversed}.svg`;
  }

  const alt = tagline === "none" ? "Second Pair" : `Second Pair — ${TAGLINES[tagline]}`;
  const safeStyle: CSSProperties = { display: "block", height: "auto", maxWidth: "100%", ...style };

  return <img src={`${assetBase}/svg/${filename}`} alt={alt} style={safeStyle} {...props} />;
}

export type SecondPairMarkProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  variant?: "colour" | "mono-dark" | "mono-light";
  assetBase?: string;
};

export function SecondPairMark({
  variant = "colour",
  assetBase = "/brand",
  style,
  ...props
}: SecondPairMarkProps) {
  return (
    <img
      src={`${assetBase}/svg/mark-${variant}.svg`}
      alt="Second Pair"
      style={{ display: "block", height: "auto", ...style }}
      {...props}
    />
  );
}
