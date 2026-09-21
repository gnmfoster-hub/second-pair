"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The other thing the company makes, on the pages that do not say it themselves.
 *
 * Second Pair Ltd makes more than one thing and the domain is named after the
 * first, so without a line like this the second product is unreachable from
 * anywhere a visitor would look and the company is invisible behind its own
 * flagship.
 *
 * Not on the home page. That page already introduces Family APP! properly,
 * as evidence that the company ships things people use rather than as a second
 * offer, placed after the whole argument and before the close, which is where
 * proof belongs. This strip then repeated the same product about three hundred
 * pixels further down, under a heading that says almost the same words.
 *
 * Giles, looking at the site: check the location of the other items, the
 * website and the family app, they are all over the place. Two of the same
 * thing on one screen is most of what that felt like.
 *
 * A client component only so it can see which page it is on. Nothing here is
 * interactive and nothing is fetched.
 */
export function AlsoFromUs() {
  const path = usePathname();

  /*
   * And not on Family APP!'s own page either, which pointed at itself.
   */
  if (path === "/home" || path === "/" || path?.startsWith("/family-app")) return null;

  return (
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
             * its content however much the text inside it says truncate, and
             * this row's description is a long sentence. The card came out
             * 443px wide on a 390px screen and gave the whole page a sideways
             * scroll.
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
            <span
              aria-hidden
              className="ml-auto shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
