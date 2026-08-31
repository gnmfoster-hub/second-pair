"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  icon,
  badge,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  /** A count worth interrupting for. Anything falsy renders nothing. */
  badge?: number;
  exact?: boolean;
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
      {icon && (
        <span className={active ? "text-accent" : "text-muted/70 group-hover:text-muted"}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge ? (
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
