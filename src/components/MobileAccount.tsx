"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/(dashboard)/actions";

/**
 * The account corner, on a phone.
 *
 * Everything about who you are signed in as — the address, the back office
 * link, the way out — lived in the sidebar, and the sidebar is desktop only.
 * So on a phone, logged into a business, there was no way to sign out at all.
 *
 * That is worse than untidy for somebody running this: switching between a
 * real business and a test one is a thing you do several times a day, and on
 * the device most of these owners actually hold, it could not be done.
 *
 * A sheet rather than a button in the header. Sign out sitting a thumb's width
 * from the theme toggle is a mis-tap that ends your session, and the same
 * corner also has to hold the address and the admin link — which are the two
 * things that tell you *which* account you are about to leave.
 */
export function MobileAccount({
  email,
  children,
}: {
  email: string;
  /** The back-office link, which only renders for a platform administrator. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Anywhere else on the page closes it, which is what a tap outside a sheet
    // means everywhere else on a phone.
    const onTap = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onTap);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onTap);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Your account"
        // Forty-four pixels, because it is a tap target on a phone.
        className="grid size-11 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-[min(17rem,calc(100vw-2rem))] space-y-3 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-pop)]"
        >
          {/* Which account this is, first — it is the thing that decides
              whether you meant to press the button underneath it. */}
          <div className="truncate px-1 text-[11px] text-muted">{email}</div>

          {children}

          <form action={signOut}>
            <button type="submit" className="btn-ghost w-full">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
