import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileNav, MobileHeader } from "@/components/MobileNav";
import { Logo } from "@/components/Logo";
import { UpNext } from "@/components/UpNext";
import {
  InboxIcon,
  DiaryIcon,
  ClientsIcon,
  WeekIcon,
  SettingsIcon,
} from "@/components/Icons";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { studio, userEmail } = await requireStudio();
  const supabase = await createClient();
  const team = (await getArtists(studio.id)).filter((a) => a.active);

  // The one number worth carrying across every page: conversations the
  // assistant has handed over. For a one-person business that is the whole
  // reason to look at this app between jobs.
  const { count } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studio.id)
    .eq("is_test", false)
    .eq("status", "needs_human");

  return (
    <div className="flex min-h-screen">
      {/* Desktop: a sidebar. Phone: a top bar and a bottom tab bar, below. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="px-4 pb-3 pt-4">
          {/*
           * The full lockup, tagline and all. The pack wants 180px of width for
           * it; the sidebar gives about 208px inside its padding, so it fits.
           * The mobile header does not, and keeps the horizontal one.
           */}
          <Logo height={44} lockup="flush-right" />
          <div className="mt-3 truncate border-t border-border pt-3 text-sm font-medium">
            {studio.name}
          </div>
        </div>

        <nav className="space-y-0.5 px-3 pt-2">
          <NavLink href="/" exact icon={<InboxIcon />} badge={count ?? 0}>
            Inbox
          </NavLink>
          <NavLink href="/diary" icon={<DiaryIcon />}>
            Diary
          </NavLink>
          <NavLink href="/clients" icon={<ClientsIcon />}>
            Clients
          </NavLink>
          <NavLink href="/report" icon={<WeekIcon />}>
            The week
          </NavLink>
          <NavLink href="/settings" icon={<SettingsIcon />}>
            Settings
          </NavLink>
        </nav>

        {/* The middle of the sidebar was empty on every page. */}
        <UpNext timezone={studio.timezone} team={team} />

        <div className="flex-1" />

        <div className="space-y-3 border-t border-border p-3">
          <ThemeToggle />
          <div className="truncate px-3 text-[11px] text-muted">{userEmail}</div>
          <form action={signOut}>
            <button type="submit" className="btn-ghost w-full">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader businessName={studio.name}>
          <ThemeToggle compact />
        </MobileHeader>

        {/* The padding keeps the last row clear of the tab bar. */}
        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>

      <MobileNav needsYou={count ?? 0} />
    </div>
  );
}
