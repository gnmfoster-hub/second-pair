"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  icon,
  badge,
  exact = false,
  tone,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  /** A count worth interrupting for. Anything falsy renders nothing. */
  /**
   * How many want you. Null means the count could not be read — which is not
   * the same as nought, and must not look like it.
   */
  badge?: number | null;
  exact?: boolean;
  /**
   * This section's hue, for the icon.
   *
   * A token name rather than a colour, so the theme decides what it is on
   * paper and on ink and this file never learns two of them. Optional: a link
   * without one keeps the grey it always had, which is what the settings rail
   * and anything added later should do until somebody decides it is a section.
   */
  tone?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-surface-2 font-medium text-foreground"
          : "text-muted hover:bg-surface-2/60 hover:text-foreground"
      }`}
    >
      {/* The active marker is a rail rather than a filled block: it says which
          page you are on without competing with the accent used for actions. */}
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
      )}
      {/*
        * The section's hue, on whether you are here or not.
        *
        * It used to go cobalt when active and grey otherwise, which made the
        * icon say the one thing the rail and the fill were already saying and
        * nothing at all the rest of the time. A hue that only appears on the
        * page you are looking at cannot be learned, because you only ever see
        * one of them.
        *
        * So it is constant, and the rail beside it carries "you are here".
        * Slightly held back when you are elsewhere, so the list still reads as
        * one quiet column rather than six colours shouting at once.
        */}
      {icon && (
        <span
          className={tone ? "" : active ? "text-accent" : "text-muted/70 group-hover:text-muted"}
          style={tone ? { color: `var(${tone})`, opacity: active ? 1 : 0.75 } : undefined}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge === null ? (
        // Something is there or nothing is; we could not find out. A dot says
        // "look" without claiming a number that might be wrong.
        <span
          className="ml-auto size-1.5 shrink-0 rounded-full bg-warn"
          title="Could not check. Open the inbox"
          aria-label="Count unavailable"
        />
      ) : badge ? (
        <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-warn">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function TabLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-1 pb-3 text-sm transition-colors ${
        active
          ? "border-accent font-medium text-foreground"
          : "border-transparent text-muted hover:border-border hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * A link in a settings rail: grouped down the side rather than along the top.
 *
 * Ten tabs in a row wrapped onto a second line and the groups landed wherever
 * there happened to be space, so "Around a booking" sat under "Prices" and
 * read as belonging to it. Down the side they cannot wrap, the headings stay
 * with what they head, and the list can grow without the page changing shape.
 *
 * The active one is filled rather than underlined: on a vertical list an
 * underline reads as a divider between two rows rather than as a state.
 */
export function RailLink({
  href,
  children,
  /**
   * Every address in this rail, so the longest match can win.
   *
   * Without it the highlight was an exact match, so anything below a section —
   * /settings/data/clients, /settings/data/takings — lit nothing at all, and
   * the rail said you were nowhere on the page you were looking at. A plain
   * startsWith is no good either: /settings is the start of every other
   * settings address and would light the business page on every screen.
   */
  siblings = [],
}: {
  href: string;
  children: React.ReactNode;
  siblings?: string[];
}) {
  const pathname = usePathname();

  const best = [...new Set([href, ...siblings])]
    .filter((one) => pathname === one || pathname.startsWith(one + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const active = best === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-surface-2 font-medium text-foreground"
          : "text-muted hover:bg-surface-2/60 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
