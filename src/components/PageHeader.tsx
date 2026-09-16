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

/** A page's outer frame — one place that owns the reading width and rhythm. */
export function Page({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto ${wide ? "max-w-6xl" : "max-w-4xl"} px-8 py-9`}>{children}</div>
  );
}
