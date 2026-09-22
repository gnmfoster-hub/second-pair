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
          /*
            * A sheet, not a dropdown.
            *
            * It was a 19rem panel of 15px links at 40px tall, which is under
            * the size a thumb wants and looked like a browser context menu.
            * Giles: the menu on mobile could be better looking and easier to
            * use. It runs the width of the screen now, the rows are 56px with
            * the label at 17px, and each carries an arrow so it reads as
            * somewhere to go rather than a list of words.
            */
          className="fixed inset-x-3 top-[84px] z-50 overflow-hidden p-2"
          style={{
            background: "var(--surface)",
            border: "2px solid var(--foreground)",
            borderRadius: 22,
            boxShadow: "0 24px 50px -20px rgba(22,21,15,0.5)",
          }}
        >
          <nav className="grid gap-0.5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-4 text-[17px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-2"
              >
                {l.label}
                <span aria-hidden className="text-muted">
                  &rarr;
                </span>
              </Link>
            ))}
          </nav>

          <div
            className="mt-1 flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center text-[16px] font-medium hover:opacity-70"
            >
              Sign in
            </Link>
            <ThemeToggle compact />
          </div>

          <a
            href="/home?say=I%20would%20like%20to%20book%20a%2015%20minute%20chat#ask"
            onClick={() => setOpen(false)}
            className="btn-primary mt-1 flex w-full"
            style={{ minHeight: 54 }}
          >
            Book a 15 minute chat
          </a>
        </div>
      )}
    </div>
  );
}
