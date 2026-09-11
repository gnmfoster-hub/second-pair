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
              <Mark className="size-7" sizePx={28} />
            </span>
            <span className="hidden min-[360px]:block sm:hidden">
              <Logo height={28} lockup="horizontal" />
            </span>
            <span className="hidden sm:block">
              <Logo height={42} lockup="inline" />
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/*
              * The other product, as a text link and never a button.
              *
              * The pack allows one call to action per screen and on every page
              * here that is "Get set up". A second button beside it would be
              * two things competing at the moment somebody is deciding, which
              * is the one thing a sales page must not do — so this is the
              * quietest thing on the row, present on every page, and invisible
              * to anybody who is not looking for it.
              *
              * Not until 768px, and this was tried at two narrower widths
              * first. Both measurements are the reason for the number.
              *
              * At 390px the header has 350 usable pixels and the logo, sign-in
              * and "Get set up" come to 274 of them. Adding this took it to
              * 349 — one pixel inside, which flex resolved by wrapping the
              * call to action onto three lines. "Get / set / up", stacked, on
              * the button the entire page exists to get somebody to press.
              *
              * Moving it to sm: moved the break rather than fixing it. 640 is
              * also where the logo swaps to the wide inline lockup and grows
              * from 108px to 158px, so the link arrived at the one width that
              * had just spent its remaining room: header 95px, button on two
              * lines, at exactly the width a tablet is held at in portrait.
              *
              * md: is the first breakpoint where the wide lockup and this both
              * fit with the button untouched. Breaking the main action in order
              * to advertise the other product is the exact trade this was meant
              * to avoid, and the homepage band carries Family APP! at every
              * width below this one anyway.
              */}
            {/*
              * The name alone did not say anything.
              *
              * "Family APP!" in a header on a page about answering enquiries
              * for tattooists reads as a stray link, not a second product —
              * you have to already know what it is for it to mean anything,
              * and nobody arriving here does. A label that has to be decoded
              * is worse than no label: it spends attention and returns
              * nothing.
              *
              * So the row keeps the quiet word and the explanation sits one
              * hover away, out of everybody's path until they go looking. No
              * JavaScript: hover opens it, and focus-within opens it for a
              * keyboard, which also means the card cannot trap a tab stop.
              *
              * The whole thing is still a link. Somebody who taps rather than
              * hovers — which is what a tablet does — lands on the page that
              * explains it properly, so the card is an improvement for a mouse
              * and never a requirement for anybody else.
              */}
            <div className="group relative hidden md:block">
              <Link
                href="/family-app"
                className="flex items-center gap-1.5 whitespace-nowrap py-2 text-sm text-muted transition-colors hover:text-foreground"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/family/icon-96.png"
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0 rounded-[4px]"
                />
                Family APP!
              </Link>

              {/* Right-aligned, because it hangs off a link near the right edge
                  of a max-w-5xl row and a centred card would sit off the page
                  on a 768px screen. */}
              <div
                className="pointer-events-none invisible absolute right-0 top-full z-40 w-[19rem] translate-y-1 rounded-xl border border-border bg-background p-4 opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none"
                role="presentation"
              >
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/family/icon-96.png"
                    alt=""
                    width={28}
                    height={28}
                    className="shrink-0 rounded-[7px]"
                  />
                  <span className="text-sm font-semibold">Family APP!</span>
                  <span className="pill bg-surface-2 text-muted">Early access</span>
                </div>

                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  Our other product. A private hub for one family &mdash; chat, photos, a
                  shared calendar and an AI holiday planner. Nothing to do with your
                  diary; we just build it too.
                </p>

                <Link
                  href="/family-app"
                  className="mt-3 inline-block text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-current"
                >
                  Have a look &rarr;
                </Link>
              </div>
            </div>
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
                  A private hub for one family — chat, photos, dates, holidays
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
