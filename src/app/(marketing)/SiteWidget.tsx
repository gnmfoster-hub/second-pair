"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Our own widget on our own site, mounted and — the important half — removed.
 *
 * It was a <Script> in the layout, which loads it fine and cannot clean up
 * after it. widget.js appends its launcher, teaser and panel to document.body,
 * so when somebody pressed Sign in and Next swapped the marketing layout out,
 * React unmounted the script tag and left everything the script had built
 * sitting on the page. The bubble then followed them onto the login screen and
 * into the product, which is exactly what Giles reported and what my first
 * check missed: loading /login directly is a fresh document and shows nothing,
 * and only clicking through reproduces it.
 *
 * So the elements are tracked rather than trusted. Anything that appears
 * directly under <body> between injecting the script and unmounting is the
 * widget's, and goes with it. That needs no cooperation from widget.js, which
 * is a file customers load from their own sites and should not grow a teardown
 * API for our convenience.
 */

/** How long to wait before it turns up, by where somebody is. */
function delayFor(path: string): number {
  /*
   * The home page plays a twenty-four second demo, and a chat bubble arriving
   * over the top of it interrupts the one thing the page is for. Giles asked
   * for it to hold off until people have seen the demo in full.
   */
  if (path === "/" || path === "/home") return 27000;
  return 9000;
}

export function SiteWidget() {
  const path = usePathname();

  useEffect(() => {
    let script: HTMLScriptElement | null = null;

    const id = window.setTimeout(() => {
      script = document.createElement("script");
      script.src = "/widget.js";
      script.async = true;
      script.setAttribute("data-studio", "help");
      script.setAttribute("data-accent", "#1f3be3");
      script.setAttribute("data-text", "#ffffff");
      script.setAttribute("data-teaser", "Ask me anything about Second Pair. I am the real one, not a demo.");
      script.setAttribute("data-teaser-repeat", "1");
      /*
       * The small one. Giles: make it a smaller bubble so it does not take
       * lots of space. Ours sits over a long marketing page rather than a
       * shop's own site, so the button is a 44px circle and does not widen
       * into a pill to say it is answering.
       *
       * Per page, so no client's own launcher changes size.
       */
      script.setAttribute("data-compact", "1");
      document.body.appendChild(script);
    }, delayFor(path));

    return () => {
      window.clearTimeout(id);
      script?.remove();

      /*
       * Only what the widget marked as its own.
       *
       * This used to remove every child of <body> that had not been there when
       * the effect ran, which sounded safe and was not: by the time React
       * unmounts this layout it has already inserted the next page, so "new
       * since we started" included React's own freshly rendered content. It
       * was deleted, React then crashed reconciling nodes that no longer
       * existed — "Failed to execute 'insertBefore'... not a child of this
       * node" — and the error boundary showed "This page couldn't load".
       *
       * Which is what Giles kept hitting on Sign in, twice, after I said it
       * was fixed. The first fix was a prefetch guess and it was wrong; this
       * is the actual cause, reproduced and read off the stack.
       *
       * A selector can only ever match the widget's own elements. If somebody
       * is on a cached widget.js without the attribute, nothing is removed and
       * the bubble lingers for one navigation — the old, small bug — rather
       * than the page dying. That is the right way round to fail.
       */
      for (const el of Array.from(
        document.querySelectorAll("[data-secondpair-widget]"),
      )) {
        el.remove();
      }
      document.getElementById("sp-widget-keyframes")?.remove();
    };
  }, [path]);

  return null;
}
