"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The four sections, on a phone.
 *
 * The nav hides them below lg because a narrow bar cannot hold four links
 * beside a logo and a button, and the note where they are hidden said the
 * footer was where a phone finds them. It is not: nobody scrolls four
 * thousand pixels to find out that a site has a services page. Every section
 * of the site was unreachable from the top of it on the device most people
 * arrive on.
 *
 * A panel rather than a full-screen takeover, because there are four links and
 * a takeover for four links is theatre.
 */
const LINKS = [
  { href: "/system", label: "The Second Pair system" },
  { href: "/websites", label: "Websites" },
  { href: "/apps", label: "Apps" },
  { href: "/work", label: "Our work" },
  { href: "/company", label: "The company" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  /* Escape closes it, and so does anything outside it. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="relative lg:hidden" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={open ? "Close the menu" : "Open the menu"}
        className="grid size-11 place-items-center rounded-full transition-colors"
        style={{ border: "1.5px solid var(--foreground)" }}
      >
        {/* Two bars into a cross, which is the whole animation it needs. */}
        <span aria-hidden className="relative block h-[11px] w-[18px]">
          <span
            className="absolute left-0 block h-[2px] w-full transition-transform duration-200"
            style={{
              background: "var(--foreground)",
              top: open ? 5 : 0,
              transform: open ? "rotate(45deg)" : "none",
            }}
          />
          <span
            className="absolute left-0 block h-[2px] w-full transition-transform duration-200"
            style={{
              background: "var(--foreground)",
              top: open ? 5 : 9,
              transform: open ? "rotate(-45deg)" : "none",
            }}
          />
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(19rem,calc(100vw-2rem))] p-2"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--foreground)",
            borderRadius: 18,
            boxShadow: "0 18px 40px -18px rgba(22,21,15,0.45)",
          }}
        >
          <nav className="grid">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors hover:bg-surface-2"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div
            className="mt-2 flex items-center justify-between gap-3 px-3 pb-1 pt-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-[15px] font-medium hover:opacity-70"
            >
              Sign in
            </Link>
            <ThemeToggle compact />
          </div>
        </div>
      )}
    </div>
  );
}
