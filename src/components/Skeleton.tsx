/**
 * What a page looks like while it is fetching.
 *
 * Server components render nothing until their data arrives, so every
 * navigation showed a blank panel for as long as the database took. The app
 * was fast and felt slow, which is the same thing to whoever is using it.
 *
 * These shapes match the real layout closely enough that the page settles
 * into place rather than jumping — a skeleton that is the wrong shape is worse
 * than none, because the content visibly rearranges when it lands.
 */

export function Bar({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`block rounded-md bg-surface-2 motion-safe:animate-pulse ${className}`}
      style={style}
      aria-hidden
    />
  );
}

/** A page heading and its line of explanation. */
export function HeaderSkeleton() {
  return (
    <div>
      <Bar className="h-7 w-36" />
      <Bar className="mt-2.5 h-3.5 w-64" />
    </div>
  );
}

/** A list of people: face, two lines, something on the right. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card mt-4 divide-y divide-border overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-3.5">
          <Bar className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            {/* Varied widths, so it reads as names rather than a barcode. */}
            <Bar className="h-3.5" style={{ width: `${28 + ((i * 17) % 34)}%` }} />
            <Bar className="mt-2 h-3" style={{ width: `${44 + ((i * 23) % 30)}%` }} />
          </div>
          <Bar className="h-6 w-20 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** The row of figures above a list. */
export function StatsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4">
          <Bar className="h-7 w-20" />
          <Bar className="mt-2.5 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
