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
       * Above the mobile tab bar, which is 3.25rem plus the safe area on a
       * phone with a home bar. Sitting under it would make the button useless
       * on the device most of these owners are holding.
       */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close help" : "Get help"}
        className="fixed bottom-[5.5rem] right-4 z-40 grid size-12 place-items-center rounded-full border border-border bg-surface text-foreground shadow-[var(--shadow-pop)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:bottom-5"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8 8 0 0 1-11.6 7.1L4 20l1.5-4.9A8 8 0 1 1 21 11.5Z" />
            <path d="M9.6 9.4a2.5 2.5 0 0 1 4.7 1.1c0 1.7-2.4 1.9-2.4 3.2" />
            <path d="M12 16.2h.01" />
          </svg>
        )}
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Help"
          className="fixed bottom-[9.5rem] right-4 z-40 h-[min(34rem,70vh)] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)] md:bottom-20"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {/*
           * The widget itself, in a frame.
           *
           * Not a copy of it — the same route a customer's website loads, so
           * anything that improves the widget improves this, and support can
           * never quietly drift into being a different product.
           */}
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
