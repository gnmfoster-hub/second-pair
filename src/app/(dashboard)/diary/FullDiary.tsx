"use client";

import { useEffect, useState } from "react";

const CLASS = "diary-focus";
const REMEMBERED = "diary-focus";

/**
 * The diary, and nothing else.
 *
 * Everything around it is useful and all of it costs room: a bar naming the
 * business, a tab bar, two rows of controls, and the padding that keeps the
 * last appointment clear of the tabs. On a phone that is most of a screen, and
 * somebody looking at their day does not want any of it — they want Tuesday.
 *
 * A class on the body rather than a prop threaded through the layouts,
 * because the things being hidden live in three components and none of them
 * knows the diary exists. The rules are in globals.css beside the reasoning.
 *
 * Remembered, because the alternative is pressing it again every time an arrow
 * moves the week — the diary navigates by links, so a mode kept only in React
 * state would not survive going to tomorrow.
 */
export function FullDiary() {
  const [full, setFull] = useState(false);

  // On mount, because localStorage does not exist on the server and a guess
  // would flash the wrong layout before correcting itself.
  useEffect(() => {
    let want = false;
    try {
      want = window.localStorage.getItem(REMEMBERED) === "1";
    } catch {
      // A private window, or site data switched off. Not worth a word.
    }
    setFull(want);
    document.body.classList.toggle(CLASS, want);
  }, []);

  /*
   * Take the class off on the way out.
   *
   * It is set on the body, which outlives this page — so leaving the diary for
   * the inbox with it still on would hide that page's chrome too, and the tab
   * bar with it. Which would leave somebody on a screen with no way off it.
   */
  useEffect(() => () => document.body.classList.remove(CLASS), []);

  const set = (want: boolean) => {
    setFull(want);
    document.body.classList.toggle(CLASS, want);
    try {
      window.localStorage.setItem(REMEMBERED, want ? "1" : "0");
    } catch {
      // Then it lasts for this sitting, which is most of the value anyway.
    }
  };

  return (
    <button
      type="button"
      onClick={() => set(!full)}
      aria-pressed={full}
      title={full ? "Show everything else again" : "Just the diary"}
      aria-label={full ? "Show everything else again" : "Just the diary"}
      /*
       * Bottom left on a phone, because Add is bottom centre and this is the
       * other thing a thumb reaches for without looking. Small and quiet: it
       * is a comfort, not a call to action, and the orange here is spoken for.
       *
       * Bottom right from md up, where the left of the screen is the sidebar
       * and a button floating over it would look like part of it.
       *
       * Not hidden on a tablet, which was the first version and was wrong: a
       * tablet is where this earns most. The sidebar alone is two hundred and
       * forty pixels, and it is the device somebody props on the desk and
       * reads the week off all day.
       *
       * z-40 so it survives its own mode — the tab bar it sits above is hidden
       * by then, and this is the only way back.
       */
      className="btn fixed bottom-[calc(3.25rem+env(safe-area-inset-bottom)+0.75rem)] left-4 z-40 size-11 justify-center rounded-full border border-border bg-surface p-0 text-muted shadow-[0_6px_16px_-6px_rgb(0_0_0/0.35)] transition-[transform,box-shadow] duration-100 hover:text-foreground active:translate-y-0.5 motion-reduce:transition-none md:bottom-4 md:left-auto md:right-4"
      style={full ? { bottom: "calc(0.75rem + env(safe-area-inset-bottom))" } : undefined}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {full ? (
          // Arrows pulling in: this closes it.
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        ) : (
          // Arrows pushing out to the corners: this opens it up.
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
    </button>
  );
}
