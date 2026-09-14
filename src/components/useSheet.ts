"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Putting a sheet at the top of the document, not where it was written.
 *
 * z-index only means anything inside its own stacking context, and a modal
 * written next to the button that opens it inherits whatever context that
 * button happens to sit in. The diary's sheet was z-50, the tab bar z-40 and
 * the full-screen button z-40 — and both of those painted over the sheet
 * anyway, because the sheet's fifty was fifty inside a box that was itself
 * behind them. From a screenshot: the last option on the add menu sat under
 * the tab bar, with a round button on top of it.
 *
 * Nothing about the markup says which ancestor did it, and the next one added
 * would do it again. So the sheet goes to the body, where its z-index is
 * compared against the things it actually has to beat.
 *
 * Guarded for the server, where there is no body. Both sheets only render
 * after somebody has tapped something, so in practice this is always the
 * browser — the check is for the one render where it is not.
 */
export function asSheet(children: ReactNode): ReactNode {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/**
 * Making a sheet behave like a sheet on a phone.
 *
 * Three separate faults produced one complaint — "the box is cut off, and when
 * it is open the diary behind scrolls instead of the box" — and each needed
 * its own fix.
 *
 * The page behind was never held still. A touch-drag anywhere over a modal
 * scrolls whatever is underneath it unless something stops it, so dragging to
 * reach the bottom of the form moved the diary and left the form exactly where
 * it was. That is the half that reads as broken rather than awkward.
 *
 * Scrolling inside it chained out. Reaching the end of a scrollable box hands
 * the rest of the gesture to its parent, so even the part that did scroll
 * would run out and start dragging the diary mid-flick.
 *
 * And the height was measured against the wrong thing. dvh is the window, and
 * a phone keyboard does not change the window on iOS — it covers it. So a
 * sheet sized to 82dvh put its bottom third, which is where Save is,
 * underneath the keyboard with nothing out of view as far as the layout knew.
 * `interactiveWidget` in the viewport settles this on Android and Chrome and
 * does nothing at all on iOS Safari, where the only thing that knows is
 * visualViewport.
 *
 * Returns a ref to put on the sheet itself. The lock and the measuring both
 * last exactly as long as the component does, which is the whole time the
 * sheet is open and no longer.
 */
export function useSheet<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  /*
   * Hold the page still underneath.
   *
   * Fixed rather than `overflow: hidden`, because iOS Safari ignores overflow
   * on the body for touch scrolling. Fixing it does move the page to the top,
   * so the scroll position is carried on `top` and put back on the way out —
   * without that, closing the sheet drops somebody at the top of a diary they
   * had scrolled to four o'clock.
   */
  useEffect(() => {
    const body = document.body;
    const y = window.scrollY;

    const was = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = was.position;
      body.style.top = was.top;
      body.style.left = was.left;
      body.style.right = was.right;
      body.style.overflow = was.overflow;
      window.scrollTo(0, y);
    };
  }, []);

  /*
   * How much screen there actually is, keyboard included.
   *
   * Written to a custom property on the sheet rather than to state, so a
   * keyboard opening does not re-render a form somebody is typing into.
   */
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = ref.current;
    if (!viewport || !el) return;

    const measure = () => el.style.setProperty("--sheet-room", `${viewport.height}px`);

    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);

    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  return ref;
}
