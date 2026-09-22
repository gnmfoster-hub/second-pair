"use client";

import Link from "next/link";
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
          /*
            * A sheet, the same one the public site has.
            *
            * This was a 17rem panel of full-width ghost buttons hanging off the
            * corner — Giles's word was horrible, and the marketing menu had the
            * same fault before it was rebuilt. It runs the width of the screen
            * now, with 56px rows, a 2px ink edge and the account it belongs to
            * at the top, so the two menus in this product behave alike.
            */
          className="fixed inset-x-3 top-[72px] z-40 overflow-hidden rounded-[22px] p-2"
          style={{
            background: "var(--surface)",
            border: "2px solid var(--foreground)",
            boxShadow: "0 24px 50px -20px rgba(22,21,15,0.5)",
          }}
        >
          {/* Which account this is, first, because it is the thing that decides
              whether you meant to press the button underneath it. */}
          <div
            className="truncate px-4 pb-2 pt-1 text-[12.5px] text-muted"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            {email}
          </div>

          {/*
            * Help lives here too, and for the same reason as everything else
            * in this sheet.
            *
            * It is a link in the sidebar and there are only five tabs on a
            * phone, so on mobile the only route to it was the floating
            * assistant's "ask a person instead" — which renders nothing at all
            * until a support studio is configured. Raising a request could
            * therefore be impossible on the device it is most likely to be
            * needed from: mid-day, between clients, when something is wrong.
            *
            * A sixth tab would have crowded the bar on a small phone for
            * something reached once a month. This corner is where the things
            * you look for by thinking "where are my account bits" belong.
            */}
          <Link
            href="/help"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-4 text-[17px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-2"
          >
            Help
            <span aria-hidden className="text-muted">
              &rarr;
            </span>
          </Link>

          <div className="mt-1 grid gap-1 [&_a]:min-h-[56px] [&_a]:rounded-2xl [&_a]:px-4 [&_a]:text-[17px] [&_a]:font-medium [&_a]:flex [&_a]:items-center [&_button]:min-h-[56px] [&_button]:rounded-2xl [&_button]:px-4 [&_button]:text-[17px]">
            {children}
          </div>

          <form action={signOut} className="mt-1">
            <button
              type="submit"
              className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-4 text-[17px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-2"
              style={{ borderTop: "1px solid var(--border)", borderRadius: 16 }}
            >
              Sign out
              <span aria-hidden className="text-muted">
                &rarr;
              </span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
