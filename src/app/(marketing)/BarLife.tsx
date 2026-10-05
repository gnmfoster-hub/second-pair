"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The bar: a logo, one orange button, and MENU.
 *
 * The bar was the last ordinary thing on the page: logo left, four links, two
 * buttons, on a strip of putty. Giles tried seven and chose this one. With
 * script running, the strip and the links go; the logo sits on the page, and
 * top right there are two things — "Book a chat", which is the one action the
 * site exists for and so never leaves the screen, and MENU. MENU opens a full
 * screen of cobalt out of itself, with the four pages in headline type and a
 * picture of whichever one is under the pointer.
 *
 * Three things are read from the scroll:
 * - how far down the page you are, drawn as a ring round MENU;
 * - whether a night section is under the bar (data-dark), which re-points the
 *   bar's tokens so the logo and the buttons follow;
 * - whether the page has left the top (data-scrolled), when the logo takes a
 *   backing so that what scrolls under it does not run into it.
 *
 * Without script none of this is drawn and the bar is the one in layout.tsx.
 */

const NAV: { href: string; label: string; peek: string }[] = [
  { href: "/system", label: "The Second Pair system", peek: "/shots/inbox.webp" },
  { href: "/websites", label: "Websites", peek: "/shots/site-ambers.webp" },
  { href: "/apps", label: "Apps", peek: "/shots/fa-holiday.webp" },
  { href: "/work", label: "Our work", peek: "/shots/site-livingcanvas.webp" },
];

/* An anchor, not a Link, for the reason written beside the bar's own button. */
const CHAT = "/home?say=I%20would%20like%20to%20book%20a%2015%20minute%20chat#ask";

export function BarLife() {
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /* The pictures are only fetched once the menu has been opened. */
  const [opened, setOpened] = useState(false);
  const [peek, setPeek] = useState(0);
  const path = usePathname();

  useEffect(() => {
    const bar = anchor.current?.closest("header");
    if (!bar) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty("--read", room > 0 ? Math.min(1, y / room).toFixed(4) : "0");

      /*
       * Which room is the middle of the bar in? The middle, not the foot: a
       * night section that starts directly under the bar has not reached it,
       * and turning the logo to paper over paper made it vanish.
       */
      const box = bar.getBoundingClientRect();
      const foot = box.top + box.height / 2;
      let dark = false;
      for (const el of document.querySelectorAll(".sp-night")) {
        const r = el.getBoundingClientRect();
        if (r.top <= foot && r.bottom > foot) {
          dark = true;
          break;
        }
      }
      bar.toggleAttribute("data-dark", dark);
      bar.toggleAttribute("data-scrolled", y > 60);
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
      bar.removeAttribute("data-scrolled");
    };
  }, []);

  /* Open: shut on Escape, and hold the page still behind it. */
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
  const toggle = () => {
    setOpened(true);
    setOpen((o) => {
      /* Start on the page you are on, if it is one of the four. */
      if (!o) setPeek(Math.max(0, NAV.findIndex((n) => here(n.href))));
      return !o;
    });
  };
  const shut = () => setOpen(false);

  return (
    <div ref={anchor} className="sp-bar-life" data-open={open ? "" : undefined}>
      <div className="sp-bar-acts">
        <a href={CHAT} className="sp-bar-chat">
          Book a chat
        </a>
        <button
          type="button"
          className="sp-menu-btn"
          aria-expanded={open}
          aria-controls="sp-menu"
          onClick={toggle}
        >
          <span aria-hidden>
            <i />
            <i />
          </span>
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <div id="sp-menu" className="sp-menu" inert={!open}>
        <nav aria-label="Main">
          {NAV.map((n, i) => (
            <Link
              key={n.href}
              href={n.href}
              style={{ transitionDelay: open ? `${0.14 + i * 0.07}s` : "0s" }}
              aria-current={here(n.href) ? "page" : undefined}
              data-on={i === peek ? "" : undefined}
              onMouseEnter={() => setPeek(i)}
              onFocus={() => setPeek(i)}
              onClick={shut}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* What is behind each link. Decoration: the link is the link. */}
        <div className="sp-menu-peek" aria-hidden>
          {opened &&
            NAV.map((n, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n.href} src={n.peek} alt="" data-on={i === peek ? "" : undefined} />
            ))}
        </div>

        <div className="sp-menu-foot">
          <a href={CHAT} className="sp-bar-chat" onClick={shut}>
            Book a 15 minute chat
          </a>
          <Link href="/login" prefetch={false} onClick={shut}>
            Sign in
          </Link>
          <ThemeToggle compact />
        </div>
      </div>
    </div>
  );
}
