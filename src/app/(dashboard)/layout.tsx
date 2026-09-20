import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStudio, getArtists } from "@/lib/studio";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileNav, MobileHeader } from "@/components/MobileNav";
import { AppBadge } from "@/components/AppBadge";
import { Logo } from "@/components/Logo";
import { UpNext } from "@/components/UpNext";
import {
  InboxIcon,
  DiaryIcon,
  ClientsIcon,
  WeekIcon,
  SettingsIcon,
  HelpIcon,
} from "@/components/Icons";
import { signOut } from "./actions";
import { MobileAccount } from "@/components/MobileAccount";
import { HelpButton } from "@/components/HelpButton";
import { AdminLink } from "@/components/AdminLink";
import { SetupReturn } from "@/components/SetupReturn";
import { inboxScope, scopedTo } from "@/lib/inboxScope";
import { wordsFor, capital } from "@/lib/words";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { studio, userEmail, userId } = await requireStudio();
  const words = wordsFor(studio);
  const supabase = await createClient();
  const team = (await getArtists(studio.id)).filter((a) => a.active);

  // The one number worth carrying across every page: conversations the
  // assistant has handed over. For a one-person business that is the whole
  // reason to look at this app between jobs.
  /*
   * A failed count is not nought.
   *
   * The error was discarded here, so a query that fell over showed a badge of
   * nought — which on this particular number reads as "nobody is waiting on
   * you". It is the one figure carried across every page precisely because an
   * owner checks it between jobs instead of reading the inbox, and quietly
   * telling them everything is fine is the worst thing it could do.
   */
  /*
   * Counted the same way the inbox is filled, or the two disagree.
   *
   * The badge said three and the list showed one, because the badge counted
   * the whole shop and the inbox is one person's. A number that does not match
   * the screen it points at is worse than no number: it sends somebody looking
   * for work that was never theirs.
   */
  const { data: me } = await supabase
    .from("artists")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: membership } = await supabase
    .from("studio_members")
    .select("role")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  let waiting = supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studio.id)
    .eq("is_test", false)
    .eq("status", "needs_human");

  // The same rule the inbox itself uses, from the same place. No `whose` here:
  // the badge is always about the person looking at it.
  waiting = scopedTo(
    waiting,
    inboxScope({ owns: membership?.role === "owner", artistId: me?.id ?? null }),
  );

  const { count, error: countFailed } = await waiting;

  const needsYou = countFailed || count == null ? null : count;

  /*
   * Only offer help if there is a studio behind it.
   *
   * The variable was set to "help" and no studio of that name had ever been
   * created, so the button appeared on every screen for every business and
   * every press of it opened a 404. A dead help button is worse than none at
   * all: it is the one thing somebody reaches for when they are already stuck,
   * and it tells them the company cannot keep its own website working.
   *
   * Checked rather than trusted, because the failure is invisible from in
   * here — the name is a string in an environment variable, nothing validates
   * it, and the page it points at is somebody else's route.
   */
  const wanted = process.env.NEXT_PUBLIC_SUPPORT_SLUG?.trim() || null;
  /*
   * Asked with our own client, not the signed-in one.
   *
   * The support business belongs to us, not to the business looking at this
   * screen — so row-level security quite correctly hid it, the lookup returned
   * nothing, and the help button rendered for nobody at all except whoever
   * happened to own the support studio. Every other business had no way to ask
   * for help from inside the product, and nothing said so: the feature is
   * written to render nothing when it is not configured, and this looked
   * exactly like that.
   *
   * Nothing sensitive is read — a slug we already have in an environment
   * variable, and whether it exists.
   */
  const supportSlug = wanted
    ? (
        await createAdminClient()
          .from("studios")
          .select("slug")
          .eq("slug", wanted)
          .is("archived_at", null)
          .maybeSingle()
      ).data?.slug ?? null
    : null;

  if (wanted && !supportSlug) {
    // Worth saying out loud: it is a setting pointing at nothing, and the only
    // symptom is a button that does nothing useful.
    console.error(`[help] NEXT_PUBLIC_SUPPORT_SLUG is "${wanted}" and no such studio exists.`);
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop: a sidebar. Phone: a top bar and a bottom tab bar, below. */}
      {/*
        * The shell recedes so the work can come forward.
        *
        * The sidebar was white and the page was paper, which put the
        * navigation on the same plane as the cards and slightly brighter
        * than them — so the chrome competed with the content. Paper here
        * and white on the cards gives one clear order: frame, page, thing.
        */}
      {/*
        * The ink for the stamps.
        *
        * A stamp that is only rotated is not a stamp, it is a wonky rectangle
        * — Giles said exactly that and he is right. What makes rubber read as
        * rubber is the edge: ink does not reach the whole shape, so the border
        * and the letters come out broken and uneven rather than cut.
        *
        * Turbulence displaced by a pixel and a half does that, and only that.
        * It roughens edges and leaves the middle of a letterform alone, so the
        * word is still perfectly readable at ten and a half pixels — which it
        * would not be at any larger a displacement.
        *
        * Defined once here rather than per stamp: a filter is referenced by id
        * and forty references to one definition cost forty references.
        */}
      <svg width="0" height="0" aria-hidden focusable="false" className="absolute">
        {/*
          * Worn rubber, which is two effects and not one.
          *
          * The first attempt only pushed the edges about, and Giles said it
          * looked like wonky words. He was right: a shape that is displaced is
          * still a solid shape, and nothing about a solid shape says ink.
          *
          * What makes a stamp look like a stamp is that the ink does not all
          * arrive. Rubber is uneven, the paper is uneven, and the result is a
          * mark with holes in it — thin in places, missing in others. So the
          * second turbulence is punched out of the first, which takes bites
          * out of the border and the letters rather than wobbling them.
          *
          * The threshold in the colour matrix is what decides how worn it is.
          * Too much and it is unreadable at ten pixels; this is set so the
          * holes are small enough to read through and big enough to see.
          */}
        <filter id="stamp-ink" x="-12%" y="-30%" width="124%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="4" result="rough" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="rough"
            scale="2.4"
            xChannelSelector="R"
            yChannelSelector="G"
            result="pressed"
          />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="11" result="speckle" />
          {/* Keep only the lightest of the noise, as the shape of the gaps. */}
          <feColorMatrix
            in="speckle"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    6 0 0 0 -3.1"
            result="gaps"
          />
          <feComposite in="pressed" in2="gaps" operator="out" />
        </filter>
      </svg>

      {/*
       * Stays put while the page moves.
       *
       * It was an ordinary flex child, so it was as tall as whatever it sat
       * beside and scrolled away with it — on a long settings page or a diary
       * scrolled down, the navigation, the business name and the sign-out
       * simply left. Sticky with a viewport height of its own keeps it there,
       * and it scrolls internally on a short screen so the sign-out at the
       * bottom is always reachable.
       */}
      <aside
        data-chrome
        className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:overflow-y-auto"
      >
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
          <NavLink href="/" exact icon={<InboxIcon />} badge={needsYou}>
            Inbox
          </NavLink>
          <NavLink href="/diary" icon={<DiaryIcon />}>
            Diary
          </NavLink>
          <NavLink href="/clients" icon={<ClientsIcon />}>
            {capital(words.customers)}
          </NavLink>
          <NavLink href="/report" icon={<WeekIcon />}>
            Reports
          </NavLink>
          {/*
            * Straight to their own, for somebody who does not own the place.
            *
            * /settings is the business page, and a stylist's list does not
            * contain it — so pressing Settings landed her on a page that was
            * not one of her destinations, and she had to find her own name in
            * the rail and press again. Two taps to reach the only settings she
            * has.
            */}
          <NavLink
            href={membership?.role === "owner" ? "/settings" : "/settings/you"}
            icon={<SettingsIcon />}
          >
            Settings
          </NavLink>
          <NavLink href="/help" icon={<HelpIcon />}>
            Help
          </NavLink>
        </nav>

        {/* The middle of the sidebar was empty on every page. */}
        <UpNext timezone={studio.timezone} team={team} />

        <div className="flex-1" />

        <div className="space-y-3 border-t border-border p-3">
          {/* Only renders for a platform administrator, which is one person. */}
          <AdminLink />
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
          {/* The sidebar holds all of this on a desktop, and the sidebar does
              not exist on a phone, so there was no way to sign out at all. */}
          <MobileAccount email={userEmail}>
            <AdminLink />
          </MobileAccount>
        </MobileHeader>

        {/*
         * Help, from the product itself.
         *
         * Nothing renders unless a support studio is configured, so this is off
         * until somebody sets NEXT_PUBLIC_SUPPORT_SLUG to a studio whose
         * clients are the business owners.
         */}
        <HelpButton slug={supportSlug} />

        {/* A way back to the walk-through from wherever a step sent them. */}
        <SetupReturn />

        {/* The padding keeps the last row clear of the tab bar. */}
        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>

      {/*
        * The same number, on the home screen icon.
        *
        * Rendered from here rather than from its own fetch so it cannot
        * disagree with the tab beside it — one count, two places it appears.
        */}
      <AppBadge count={needsYou ?? 0} />
      <MobileNav needsYou={needsYou ?? 0} customers={capital(words.customers)} />
    </div>
  );
}
