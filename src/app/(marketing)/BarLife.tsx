"use client";

import { useEffect, useRef } from "react";

/**
 * The bar, reacting to the page under it.
 *
 * Two things, both read from the scroll and neither changing what the bar is:
 *
 * A cobalt line grows along the ink rule as the page is read, so the rule
 * that was only a border is also how far down you are.
 *
 * And the bar takes the colour of the room it is over. The home page now has
 * night sections, and a putty bar across the top of a night sky cut the sky
 * off. Any section marked sp-night turns the bar to night while it is under
 * it, by re-pointing the bar's own tokens, so the logo, the links and the
 * buttons all follow without knowing anything about it.
 *
 * Without script the bar is exactly what it was.
 *
 * TRYING OUT: three other bars, chosen with ?bar=pill, ?bar=ink or ?bar=hide
 * on any address (?bar=room is the one described above). The choice is kept
 * for the browser tab so it survives moving between pages. Once Giles has
 * picked one, the others and this switch come out. See bar.css.
 */
const BARS = ["room", "pill", "ink", "hide"];

export function BarLife() {
  const rule = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bar = rule.current?.closest("header");
    if (!bar) return;

    let pick = new URLSearchParams(window.location.search).get("bar");
    try {
      if (pick && BARS.includes(pick)) window.sessionStorage.setItem("sp-bar", pick);
      else pick = window.sessionStorage.getItem("sp-bar");
    } catch {
      /* A private window may refuse storage. The address still works. */
    }
    if (pick && BARS.includes(pick)) bar.dataset.bar = pick;

    let frame = 0;
    let last = window.scrollY;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty("--read", room > 0 ? Math.min(1, y / room).toFixed(4) : "0");

      /* Which room is the foot of the bar in? */
      const foot = bar.getBoundingClientRect().bottom;
      let dark = false;
      for (const el of document.querySelectorAll(".sp-night")) {
        const r = el.getBoundingClientRect();
        if (r.top <= foot && r.bottom > foot) {
          dark = true;
          break;
        }
      }
      bar.toggleAttribute("data-dark", dark);

      /* Going down the page, or back up it. Only the "hide" bar uses this. */
      if (Math.abs(y - last) > 6) {
        bar.toggleAttribute("data-down", y > last && y > 240);
        last = y;
      }
    };

    const ask = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      if (frame) cancelAnimationFrame(frame);
      bar.removeAttribute("data-dark");
      bar.removeAttribute("data-down");
    };
  }, []);

  return <span ref={rule} className="sp-bar-rule" aria-hidden />;
}
