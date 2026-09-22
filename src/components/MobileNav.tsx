"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "@/components/Logo";
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
/*
 * The same hue per section as the sidebar, on the icon.
 *
 * It matters more here than there. The phone bar has five tabs at ten point
 * with no room to grow, so the label is nearly unreadable at arm's length and
 * the icon is what anybody actually aims at — five grey glyphs of a similar
 * size are told apart by shape alone, and shape is what you read second.
 */
const TABS = [
  { href: "/", label: "Inbox", icon: InboxIcon, exact: true, tone: "--sec-inbox" },
  { href: "/diary", label: "Diary", icon: DiaryIcon, tone: "--sec-diary" },
  { href: "/clients", label: "Clients", icon: ClientsIcon, tone: "--sec-clients" },
  { href: "/report", label: "Reports", icon: WeekIcon, tone: "--sec-reports" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, tone: "--sec-settings" },
];

export function MobileNav({
  needsYou = 0,
  customers = "Clients",
}: {
  needsYou?: number;
  /** What this trade calls the people it serves: Clients, Patients, Pupils. */
  customers?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      data-chrome
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Sections"
    >
      <ul className="flex">
        {TABS.map((t) => (t.href === "/clients" ? { ...t, label: customers } : t)).map((tab) => {
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
                {/*
                  * The hue on the icon, the accent on the label.
                  *
                  * Splitting them is what lets both say something: the colour
                  * says which section, and the label going cobalt and the rail
                  * appearing say which one you are in.
                  */}
                <span
                  className="relative"
                  style={{ color: `var(${tab.tone})`, opacity: active ? 1 : 0.75 }}
                >
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
      data-chrome
      className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      {/*
        * The mark at the size the public site uses.
        *
        * This was height={20}, which is a 19px mark: the smallest thing on the
        * bar, on the one screen a business opens forty times a day, and a
        * third of the size of the same mark on the marketing header. Giles
        * asked for them to match. Set in pixels rather than a rem class, which
        * is what made the public one draw 57.6 when it claimed 64.
        */}
      <Mark className="size-[44px] shrink-0" sizePx={44} />
      <div className="min-w-0 flex-1 border-l border-border pl-3">
        <div className="truncate text-sm font-medium leading-tight">{businessName}</div>
      </div>
      {children}
    </header>
  );
}
