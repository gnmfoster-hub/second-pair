/**
 * Every page opens the same way: a title, a line saying what the page is for,
 * and whatever action belongs to it on the right. Five pages inventing five
 * headings is what makes an app feel stitched together.
 */
export function PageHeader({
  title,
  children,
  action,
}: {
  title: string;
  /** The subtitle. Rich, because most of these carry a number worth bolding. */
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {/*
          * Held to a readable measure. A subtitle running the full width of a
          * wide screen is a line the eye loses its place in halfway along, and
          * these are the sentences that explain what a page is for.
          */}
        {children && <p className="hint mt-1 max-w-[62ch]">{children}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * A page's outer frame — one place that owns the reading width and rhythm.
 *
 * The width steps with the screen now. It was a flat max-w-4xl, 896px, inside
 * a main that is 1224 wide on a 1440 display, so a third of the screen was
 * margin and every page was a column down the middle — which is most of what
 * "busy" meant: the content is not busy, it is squeezed.
 *
 * It also broke something. The prices page's stylist row needs about 384px of
 * fixed columns before the service name gets any width, and in the 586px of
 * card that left there was none: every name truncated to one character. That
 * reads as a rendering fault, and it is on the live screens.
 *
 * `wide` still means wider; both steps up together.
 */
export function Page({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return <div className={wide ? "work work-wide" : "work"}>{children}</div>;
}
