import Link from "next/link";
import { Logo, Mark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The public face. Everything else in the app is behind a session.
 *
 * Deliberately its own layout rather than sharing the dashboard's: nobody who
 * has not signed up should ever load the sidebar, the nav, or a database query
 * about a business they do not have.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 sm:px-8">
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

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
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

                It pointed at /login, which is a password box — a door for
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
                fires no such event — so the button changed the address bar and
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
              className="btn inline-flex whitespace-nowrap bg-highlight font-semibold text-on-highlight hover:brightness-95"
            >
              Get set up
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/*
        * The company, above the small print.
        *
        * Second Pair Ltd makes more than one thing now, and the domain is named
        * after the first. Without a line like this the second product is
        * unreachable from anywhere a visitor would look, and the company is
        * invisible behind its own flagship.
        *
        * Deliberately a strip rather than a products page. With two products an
        * index is a page nobody opens to choose between two things they can
        * already see; at three or four it starts earning its place.
        */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-5xl px-5 py-9 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            <Link href="/company" className="hover:text-foreground">
              Also from Second Pair Ltd
            </Link>
          </p>

          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            <Link
              href="/family-app"
              /*
                * min-w-0 on the grid item, which is the whole bug.
                *
                * A grid item's min-width is auto, so it refuses to shrink below
                * its content however much the text inside it says truncate —
                * and this row's description is a long sentence. The card came
                * out 443px wide on a 390px screen and gave the whole page a
                * sideways scroll: not just here, but on the homepage, which is
                * the page that sells the thing.
                */
              className="group flex min-w-0 items-center gap-3.5 rounded-xl border border-border p-3.5 transition-colors hover:border-accent/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/family/icon-96.png"
                alt=""
                width={44}
                height={44}
                className="shrink-0 rounded-[11px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Family APP!</span>
                <span className="hint block truncate">
                  A private hub for one family: chat, photos, dates, holidays
                </span>
              </span>
              <span aria-hidden className="ml-auto shrink-0 text-muted transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
        </div>
      </section>

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
