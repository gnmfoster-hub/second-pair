import Link from "next/link";
import { Logo, Mark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlsoFromUs } from "./AlsoFromUs";
import { MobileMenu } from "./MobileMenu";

/**
 * The public face. Everything else in the app is behind a session.
 *
 * Deliberately its own layout rather than sharing the dashboard's: nobody who
 * has not signed up should ever load the sidebar, the nav, or a database query
 * about a business they do not have.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="poster flex min-h-screen flex-col">
      {/*
        * The nav bar, DESIGN.md §5.
        *
        * Full-width putty with a 2px ink rule beneath it, 76px tall on
        * desktop. It was a translucent blurred bar the colour of the page,
        * which is the default every framework ships; putty makes it an object
        * the page sits under rather than a fog over the top of it.
        *
        * No Pricing link, per §5: pricing is per job and lives inside each
        * service page as "From [YOUR PRICE]" with a Book a chat beside it.
        */}
      {/* §4, and §9 keeps it off the product: a texture over a screen of
          figures costs more than it gives. */}
      <div className="grain" aria-hidden />

      <header
        className="sticky top-0 z-30"
        style={{ background: "var(--putty)", borderBottom: "2px solid var(--foreground)" }}
      >
        <div className="shell shell-wide flex items-center gap-4" style={{ minHeight: "76px" }}>
          {/* Thirty pixels disappeared into the header, and this is the only
              place most people will ever see the name. */}
          {/*
            * Two lockups, because the wide one does not fit a phone.
            *
            * The inline lockup is seven and a half times wider than it is
            * tall, so at 42px it is 317 pixels of a 390px screen. With the
            * padding and the two buttons that put the header 91px over the
            * edge: the document was 481px wide on a 390px phone, "Sign in"
            * and "Get set up" were off the side of the display, and the whole
            * page slid left and right under the thumb.
            *
            * Measured rather than guessed. A 320px screen leaves the logo
            * 136px once the padding and buttons are taken out, which is an
            * 18px-tall inline lockup — not a logo. The horizontal lockup is
            * 4.43 wide, so 28px tall comes to 124px and fits with room over.
            */}
          <Link href="/" aria-label="Second Pair" className="shrink-0">
            {/*
              * Three, not two: the mark alone on the smallest phones.
              *
              * Measured at 320px, which is every budget Android and an SE with
              * the text size turned up: the horizontal lockup is 108px, and
              * with the padding, "Sign in" and "Get set up" that comes to 336
              * on a 320px screen. Something has to give, and the thing that was
              * giving was the call to action — "Get / set / up", three lines,
              * 80px tall.
              *
              * The mark is 28px and carries the same recognition; the company
              * name is in the page title, the footer and the first heading. A
              * name nobody can read because the button beside it has collapsed
              * is not doing the job the name is there for.
              */}
            {/*
              * The mark alone on a phone, and big.
              *
              * Giles: the logo on mobile should be much bigger. Measured at
              * 360px, the header has 320px of room and the call to action and
              * the menu take 186 of it — so a horizontal lockup can be 134px
              * wide, which is a 30px-tall logo with unreadable type in it.
              * There is no arrangement of a lockup, a button and a menu that
              * fits on a phone at a size worth having.
              *
              * The mark is square, so at 60px it costs 60px of width instead
              * of 195, and it is nearly twice the height of the lockup it
              * replaces. The bar is 76px, so that is eight pixels of air above
              * and below. It is the thing people recognise; the name is in the
              * page title, the menu and the footer.
              */}
            <span className="block sm:hidden">
              <Mark className="size-[60px]" sizePx={60} />
            </span>
            {/*
              * The tagline, which the pack had all along.
              *
              * flush-right is the pack's own default lockup and it carries
              * "you work, we answer" — but only from 54px up, because the line
              * is a fifth of the height and below that it stops being a
              * tagline and becomes grey specks. The header was asking for 42,
              * which is why it never appeared: not a missing feature, a
              * request under the floor.
              *
              * 54 is therefore the smallest height that shows it at all, and
              * it is also as large as the row can carry — measured at 640,
              * where the lockup is 189px of the 576 available and the buttons
              * want 303 of the rest.
              */}
            <span className="hidden sm:block">
              <Logo height={54} lockup="flush-right" />
            </span>
          </Link>

          {/*
            * The four sections, §5.
            *
            * The nav had no links at all: a logo on the left and two buttons
            * on the right. These are the four the brief names, in its order,
            * and they are the only navigation the site has.
            *
            * Hidden below lg rather than wrapped. §11 asks for all four plus
            * the mark at 1280px without wrapping or clipping, and a narrow
            * phone cannot hold them beside a logo and a button; the same links
            * are in the footer, which is where a phone finds them.
            */}
          <nav
            className="ml-auto hidden items-center gap-6 lg:flex"
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: "14px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Link href="/system" className="whitespace-nowrap hover:opacity-70">
              The Second Pair system
            </Link>
            <Link href="/websites" className="hover:opacity-70">
              Websites
            </Link>
            <Link href="/apps" className="hover:opacity-70">
              Apps
            </Link>
            <Link href="/work" className="whitespace-nowrap hover:opacity-70">
              Our work
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3 lg:ml-6">
            {/*
              * The other product used to live here, and does not any more.
              *
              * "Also by us: Family APP!" sat in the header of every page,
              * beside the one button the whole site exists to get somebody to
              * press. Giles put it plainly: the other things are all over the
              * place. They were — the header, a band halfway down the home
              * page, the footer, and the company page, which is four mentions
              * of a product nobody came here for on the way down one page.
              *
              * It keeps the two that earn their place: the band on the home
              * page, where it is evidence that the company builds more than a
              * diary, and the footer, where somebody who wants it can find it.
              * A sales page gets one thing to press, and this was not it.
              */}
            {/* The toggle lives in the phone's menu; here from lg. */}
            <div className="hidden lg:block">
              <ThemeToggle compact />
            </div>
            {/* Nowrap for the same reason as the button below it. Once the
                button stopped being the thing flex squeezed, this became it —
                "Sign / in" on two lines at 360px, a 62px-tall link next to a
                44px button. Neither of the two things a visitor came here to
                press should be allowed to fold. */}
            {/* Sign in is on the phone's menu instead, where it has room. */}
            <Link href="/login" className="btn-ghost hidden whitespace-nowrap lg:inline-flex">
              Sign in
            </Link>
            {/* The pack allows amber for one call to action per screen. This
                is that one, and it is the only amber on the page.

                It pointed at /login, which is a password box, a door for
                people who already have an account, offered to people who do
                not. Nobody self-serves onto this yet: every business is set up
                with them. So it asks, and our own assistant does the asking.

                It then pointed at #see-it, which only scrolls. On a phone that
                is fine; on a desktop, where the demo is already beside the
                headline, the main call to action on the site moved the page a
                few pixels and appeared to do nothing at all. The buttons in the
                page had already been fixed for exactly this and point at #ask,
                which opens the assistant and only scrolls when it is genuinely
                off screen. This one was left behind.

                Pointing it there was still not enough, and the reason is worth
                writing down. A plain <a> to a hash is a real navigation and
                fires hashchange, which is what the panel listens for. A
                next/link does the same journey through the History API, which
                fires no such event, so the button changed the address bar and
                nothing else happened. Same href, same page, two different
                outcomes, and nothing in the markup to suggest it.

                So this one is deliberately an anchor. It is a marketing header
                and a full navigation costs nothing; from /home itself the
                browser treats it as a same-document hash change and does not
                reload at all. */}
            <a
              href="/home#ask"
              /* Never on two lines. Flex will happily shrink a button below
                 its text and let the label wrap, which is how this ended up
                 reading "Get / set / up" on a phone; the row has other things
                 that can give, and this is not one of them. */
              /* §5: the nav's call to action is the ink button, and it is
                 "Book a chat" now rather than "Get set up" — the brief names
                 it and it describes the thing that actually happens. Never on
                 two lines: flex will shrink a button below its text and let
                 the label wrap, which is how this once read "Get / set / up"
                 on a phone. */
              className="btn-ink inline-flex whitespace-nowrap"
            >
              Book a chat
            </a>

            <MobileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/*
        * The company, above the small print, on the pages that do not say it
        * themselves. See AlsoFromUs: the home page introduces Family APP! properly
        * and in the right place, and this repeated it three hundred pixels later
        * under a heading saying almost the same words.
        */}
      <AlsoFromUs />

      {/*
        * The footer, §5: ink, with a 1px rule above it.
        *
        * It also carries the four sections, because the nav hides them below
        * lg — a phone cannot hold four links beside a logo and a button, and
        * links that exist only on a desktop are links half the visitors never
        * see.
        */}
      <footer style={{ background: "var(--foreground)", color: "var(--background)" }}>
        {/*
          * The padding is on the nav, not on a wrapper around it.
          *
          * A wrapper carrying py-12 keeps its height when the nav inside it
          * goes lg:hidden, so every desktop visitor got a hundred pixels of
          * empty ink above the rule and nothing in it.
          */}
        <div className="shell shell-wide">
          <nav
            className="flex flex-wrap gap-x-7 gap-y-3 pt-12 pb-8 lg:hidden"
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: "14px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Link href="/system">The Second Pair system</Link>
            <Link href="/websites">Websites</Link>
            <Link href="/apps">Apps</Link>
            <Link href="/work">Our work</Link>
          </nav>
        </div>
        <div
          className="shell shell-wide flex flex-wrap items-center gap-x-6 gap-y-2 pb-10 text-xs"
          style={{ color: "var(--muted-on-ink)", borderTop: "1px solid rgba(247,244,236,0.2)", paddingTop: "1.5rem" }}
        >
          {/*
            * 26 rather than 22: below 24 the name is dropped and the mark
            * stands alone, which beside "Privacy" and "Terms" read as a stray
            * icon rather than a signature.
            */}
          <span style={{ color: "var(--background)" }}>
            <Logo height={26} lockup="inline" onInk />
          </span>
          <Link href="/company" className="link-on-ink">
            The company
          </Link>
          <Link href="/privacy" className="link-on-ink">
            Privacy
          </Link>
          <Link href="/terms" className="link-on-ink">
            Terms
          </Link>
          <span className="ml-auto">Second Pair Ltd &middot; made in the UK</span>
        </div>
      </footer>
    </div>
  );
}
