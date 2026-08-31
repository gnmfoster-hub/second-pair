"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  InboxIcon,
  DiaryIcon,
  ClientsIcon,
  WeekIcon,
  SettingsIcon,
} from "@/components/Icons";

/**
 * The phone version of the nav.
 *
 * A bottom bar rather than a drawer, because these owners are one-handed —
 * holding a phone in a van, at a chair, over a consumer unit — and the bottom
 * of the screen is the only part a thumb reaches without shuffling their grip.
 *
 * It sits above the home indicator on an iPhone via the safe-area inset, or
 * the bar ends up under it and the last tab is unpressable.
 */
const TABS = [
  { href: "/", label: "Inbox", icon: InboxIcon, exact: true },
  { href: "/diary", label: "Diary", icon: DiaryIcon },
  { href: "/clients", label: "Clients", icon: ClientsIcon },
  { href: "/report", label: "Week", icon: WeekIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function MobileNav({ needsYou = 0 }: { needsYou?: number }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Sections"
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon />
                  {tab.exact && needsYou > 0 && (
                    <span
                      className="absolute -right-2 -top-1.5 grid min-w-[1.05rem] place-items-center rounded-full bg-warn px-1 text-[9px] font-semibold tabular-nums text-white"
                      aria-label={`${needsYou} need you`}
                    >
                      {needsYou > 9 ? "9+" : needsYou}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The matching top bar: who you are, and nothing else worth the space. */
export function MobileHeader({
  businessName,
  children,
}: {
  businessName: string;
  children?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">{businessName}</div>
        <div className="wordmark text-[11px] leading-tight text-muted">
          second <span className="font-medium">pair</span>
        </div>
      </div>
      {children}
    </header>
  );
}
