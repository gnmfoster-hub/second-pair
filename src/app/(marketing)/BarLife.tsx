"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The bar, reacting to the page under it.
 *
 * Read from the scroll, and without script the bar is exactly what layout.tsx
 * draws:
 *
 * - how far down the page you are, as --read, for the line along the rule;
 * - whether a night section is under the bar, as data-dark, which re-points
 *   the bar's tokens so the logo, links and buttons follow;
 * - whether the page has left the top (data-scrolled) and which way it is
 *   going (data-down).
 *
 * TRYING OUT: several bars, chosen with ?bar=<name> on any address and kept
 * for the browser tab so the choice survives moving between pages. "menu" and
 * "dock" need furniture the plain bar has not got — a full-screen menu and a
 * dock at the foot of the screen — and that is drawn here. Once Giles has
 * picked one, the others and this switch come out. See bar.css.
 */
const BARS = ["room", "pill", "ink", "hide", "menu", "dock", "morph"];

const NAV: [string, string][] = [
  ["/system", "The Second Pair system"],
  ["/websites", "Websites"],
  ["/apps", "Apps"],
  ["/work", "Our work"],
];

/* An anchor, not a Link, for the reason written beside the bar's own button. */
const CHAT = "/home?say=I%20would%20like%20to%20book%20a%2015%20minute%20chat#ask";

export function BarLife() {
  const rule = useRef<HTMLSpanElement>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const bar = rule.current?.closest("header");
    if (!bar) return;

    let chosen = new URLSearchParams(window.location.search).get("bar");
    try {
      if (chosen && BARS.includes(chosen)) window.sessionStorage.setItem("sp-bar", chosen);
      else chosen = window.sessionStorage.getItem("sp-bar");
    } catch {
      /* A private window may refuse storage. The address still works. */
    }
    if (chosen && BARS.includes(chosen)) {
      bar.dataset.bar = chosen;
      setPick(chosen);
    }

    let frame = 0;
    let last = window.scrollY;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const read = room > 0 ? Math.min(1, y / room).toFixed(4) : "0";
      bar.style.setProperty("--read", read);
      /* The dock is fixed to the screen, outside the bar's box, so it reads
         the same number from the root. */
      document.documentElement.style.setProperty("--read", read);

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
      bar.toggleAttribute("data-scrolled", y > 90);

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
      bar.removeAttribute("data-scrolled");
    };
  }, []);

  /* The full-screen menu: shut on Escape, and hold the page still behind it. */
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", key);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = was;
    };
  }, [open]);

  const here = (href: string) => path === href || path.startsWith(`${href}/`);

  return (
    <>
      <span ref={rule} className="sp-bar-rule" aria-hidden />

      {pick === "menu" && (
        <>
          <button
            type="button"
            className="sp-menu-btn"
            aria-expanded={open}
            aria-controls="sp-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden>
              <i />
              <i />
            </span>
            {open ? "Close" : "Menu"}
          </button>

          <div id="sp-menu" className="sp-menu" data-open={open ? "" : undefined} inert={!open}>
            <nav aria-label="Main">
              {NAV.map(([href, label], i) => (
                <Link
                  key={href}
                  href={href}
                  style={{ transitionDelay: `${0.12 + i * 0.06}s` }}
                  aria-current={here(href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="sp-menu-foot">
              <a href={CHAT} className="btn-ink" onClick={() => setOpen(false)}>
                Book a chat
              </a>
              <Link href="/login" prefetch={false} onClick={() => setOpen(false)}>
                Sign in
              </Link>
            </div>
          </div>
        </>
      )}

      {pick === "dock" && (
        <nav className="sp-dock" aria-label="Main">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} aria-current={here(href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
          <a href={CHAT} className="sp-dock-cta">
            Book a chat
          </a>
        </nav>
      )}
    </>
  );
}
