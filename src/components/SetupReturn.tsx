"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

export const SETUP_FLAG = "sp-setup-trip";
const CHANGED = "sp:setup-trip";

function subscribe(notify: () => void) {
  window.addEventListener(CHANGED, notify);
  return () => window.removeEventListener(CHANGED, notify);
}

function onTrip(): boolean {
  try {
    return window.sessionStorage.getItem(SETUP_FLAG) === "1";
  } catch {
    return false;
  }
}

function end() {
  try {
    window.sessionStorage.removeItem(SETUP_FLAG);
  } catch {
    // Nothing to clear.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * "Back to set-up", while somebody is part way through it.
 *
 * Shown on whatever page a set-up step sent them to, and on any page they
 * wander to from there, until they go back or close it. Kept for the tab
 * rather than for good: tomorrow they start from the home page, which says
 * where set-up is.
 */
export function SetupReturn() {
  const pathname = usePathname();
  const trip = useSyncExternalStore(subscribe, onTrip, () => false);

  // Back on the list by any route — the trip is over.
  useEffect(() => {
    if (pathname === "/settings/working" && onTrip()) end();
  }, [pathname]);

  if (!trip || pathname === "/settings/working") return null;

  return (
    <div
      data-chrome
      /*
       * Under the top bar on a phone, because the bottom already has the tab
       * bar, the diary's add button and the full-screen button. At the bottom
       * on a larger screen, clear of the sidebar and the page title.
       */
      className="pointer-events-none fixed inset-x-0 top-[calc(4.25rem+env(safe-area-inset-top))] z-40 flex justify-center px-4 md:bottom-6 md:top-auto md:pl-60"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-1 pr-1.5 shadow-lg">
        <Link href="/settings/working" className="btn rounded-full bg-accent py-2 text-sm text-on-accent">
          ← Back to set-up
        </Link>
        <button
          type="button"
          onClick={end}
          aria-label="Hide the way back to set-up"
          className="grid size-9 place-items-center rounded-full text-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
