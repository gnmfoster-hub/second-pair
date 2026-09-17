"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Help, answered by the product itself.
 *
 * Second Pair becomes its own customer: the support assistant is the same
 * widget every business puts on its own website, pointed at a studio whose
 * clients are the business owners. It answers from FAQs written once, and when
 * it cannot help it escalates exactly as it would for anybody else — into an
 * inbox, with a push notification.
 *
 * That means no new conversation engine, no second escalation path, and no
 * separate place for support history to live. It also means the person running
 * Second Pair uses the product every day to answer their own customers, which
 * is the fastest way there is to find out what is wrong with it.
 *
 * Renders nothing at all unless a support studio has been configured, so the
 * feature is off until somebody deliberately turns it on.
 */
export function HelpButton({ slug }: { slug: string | null }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  /*
   * Anywhere in the app can ask for this.
   *
   * The help page sends people here before they write a request out by hand,
   * and it has no way to reach this component's state — it is a floating
   * button mounted by the layout, not something the page owns. An event is
   * the smallest thing that works and leaves both sides ignorant of each
   * other.
   */
  useEffect(() => {
    const onAsked = () => setOpen(true);
    window.addEventListener("second-pair:help", onAsked);
    return () => window.removeEventListener("second-pair:help", onAsked);
  }, []);

  /*
   * The widget's own close button, which had nothing listening to it.
   *
   * The widget cannot close itself — it is in a frame, and the frame belongs
   * to whoever embedded it. So it asks, by posting a message out. The embed
   * script on a customer's website has always listened for that; this frame
   * never did, so the X in the corner did nothing at all, and the only screen
   * where that was true was our own.
   *
   * Origin-checked. This frame is same-origin, and a message from anywhere
   * else has no business steering the page.
   */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { secondPair?: string })?.secondPair === "close") setOpen(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!slug) return null;

  return (
    <>
      {/*
        * No floating bubble.
        *
        * It sat over the bottom right of every screen — on a phone, directly
        * over the diary, which is the screen an owner scrolls through twenty
        * times a day. It hid itself on scroll and came back, which is the
        * standard answer and still means a thing covering the work.
        *
        * Help is a place now, not an ornament: it is in the navigation, and
        * the help page opens this. Nothing floats until somebody asks for it,
        * and the panel below is exactly what it always was.
        */}
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Help"
          className="fixed bottom-[5.5rem] right-4 z-40 h-[min(34rem,70vh)] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)] md:bottom-5"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {/*
           * The widget itself, in a frame.
           *
           * Not a copy of it — the same route a customer's website loads, so
           * anything that improves the widget improves this, and support can
           * never quietly drift into being a different product.
           */}
          {/*
            * Its own way out, now that there is no bubble to press again.
            */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close help"
            className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full border border-border bg-surface text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <iframe
            src={`/widget/${slug}`}
            title="Help"
            className="h-[calc(100%-2.6rem)] w-full border-0"
          />

          {/*
            * A way to reach a person, under the assistant rather than instead
            * of it. Most questions are answered instantly and this is for the
            * rest — something is wrong, or something needs a human who can
            * change things.
            */}
          <a
            href="/help"
            className="flex h-[2.6rem] items-center justify-center border-t border-border text-[12px] font-medium text-highlight-strong hover:bg-surface-2"
          >
            Ask a person instead &rarr;
          </a>
        </div>
      )}
    </>
  );
}
