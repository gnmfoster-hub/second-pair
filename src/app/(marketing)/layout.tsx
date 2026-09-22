import Link from "next/link";
import { Logo, Mark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlsoFromUs } from "./AlsoFromUs";

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
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 sm:px-8" style={{ minHeight: "76px" }}>
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
            <span className="block min-[360px]:hidden">
              <Mark className="size-8" sizePx={32} />
            </span>
            <span className="hidden min-[360px]:block sm:hidden">
              <Logo height={32} lockup="horizontal" />
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
            <div className="hidden sm:block">
              <ThemeToggle compact />
            </div>
            {/* Nowrap for the same reason as the button below it. Once the
                button stopped being the thing flex squeezed, this became it —
                "Sign / in" on two lines at 360px, a 62px-tall link next to a
                44px button. Neither of the two things a visitor came here to
                press should be allowed to fold. */}
            <Link href="/login" className="btn-ghost whitespace-nowrap">
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

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-xs text-muted sm:px-8">
          {/*
            * 26 rather than 22: below 24 the name is dropped and the mark
            * stands alone, which beside "Privacy" and "Terms" read as a stray
            * icon rather than a signature.
            */}
          <Logo height={26} lockup="inline" />
          <Link href="/company" className="hover:text-foreground">
            The company
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <span className="ml-auto">Second Pair Ltd &middot; made in the UK</span>
        </div>
      </footer>
    </div>
  );
}
