"use client";

import { useEffect, useState } from "react";
import { EntryDialog } from "./EntryDialog";
import type { Artist } from "@/lib/types";

/**
 * The obvious way to add something.
 *
 * Until this existed the only route was clicking an empty part of the grid,
 * which is a fine shortcut once you know it and completely undiscoverable
 * before. A calendar with no visible add button looks unfinished, whatever
 * else it can do.
 *
 * It opens at the next half hour rather than at nothing, because that is
 * nearly always what somebody adding an appointment means.
 */
export function NewEntry({ artists, timezone }: { artists: Artist[]; timezone: string }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState<{ date: string; time: string } | null>(null);

  // Computed on click rather than in render: the clock is not a pure value,
  // and a server-rendered "now" would be wrong by the time it arrived.
  const start = () => {
    const now = new Date();
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const at = Object.fromEntries(local.map((p) => [p.type, p.value]));

    const minutes = Number(at.hour) * 60 + Number(at.minute);
    const next = Math.min(23 * 60 + 30, Math.ceil(minutes / 30) * 30);

    setWhen({
      date: `${at.year}-${at.month}-${at.day}`,
      time: `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`,
    });
    setOpen(true);
  };

  /*
   * Opened straight away when the home screen shortcut was used.
   *
   * Long-pressing the app icon offers "Add an appointment", and a shortcut
   * that lands on the diary and leaves you to find the button is not a
   * shortcut — it is a link with a promise on it. The parameter is taken out
   * of the address afterwards so that a refresh, or going back, does not open
   * the dialog a second time.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("add") !== "1") return;

    url.searchParams.delete("add");
    window.history.replaceState({}, "", url.pathname + url.search);
    start();
    // Once, on arrival. Deliberately not re-run when anything changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // N adds something, in the same idiom as the other single-key shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (event.key.toLowerCase() === "n" && !open) {
        event.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <button
        type="button"
        onClick={start}
        /*
         * The word goes below 360px, the plus does not.
         *
         * Measured on a real business's phone rather than estimated, twice,
         * because the first estimate was wrong. At 360 the controls need 319
         * pixels and have 313: the three view buttons are 179, the colour
         * button 41, this one 83, and the gaps 16. Over by six, so the whole
         * group wraps and this lands on a line of its own — forty-four pixels
         * of screen to say one word everybody already knows.
         *
         * Dropping the label saves forty-two of those six, which settles it at
         * every phone width rather than at the one I happened to measure. The
         * word comes back above 640px, where there is room for it and a mouse
         * to hover with.
         */
        /*
         * A floating button on a phone, and a toolbar button above that.
         *
         * Even at its smallest this was thirty-six pixels plus a gap in a row
         * that had about fifteen to spare, so it kept landing on a line of its
         * own — a whole row of screen for one button, above a diary that wants
         * every pixel. Taking it out of the row entirely is what actually
         * settles it, rather than shaving another two pixels off its
         * neighbours and hoping.
         *
         * Bottom centre, above the tab bar rather than on it: the bar is
         * fixed at z-40 and its height varies with the home indicator, so this
         * clears it with the same safe-area inset plus the bar's own 3.25rem.
         * z-30 keeps it under the bar and well under the dialog at z-50, so it
         * cannot cover the thing it opens.
         *
         * Round and larger than it was — fifty-six pixels is the size a thumb
         * hits without aiming, and the diary is a screen people poke at while
         * holding a hairdryer.
         */
        /*
         * Raised, not pasted on.
         *
         * Flat on a flat page it read as a sticker lying on the diary rather
         * than a button hovering over it. Three shadows do the work: a wide
         * soft one for the distance it floats, a tight dark one directly under
         * it for contact, and an inset white line along the top edge, which is
         * the light catching the near side of something round. Pressing it
         * drops it two pixels and pulls the shadows in, so the depth is real
         * rather than drawn.
         *
         * None of this on a desktop, where it is a normal button in a row.
         */
        className="btn fixed bottom-[calc(3.25rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-30 size-14 -translate-x-1/2 justify-center rounded-full bg-highlight p-0 font-semibold text-on-highlight shadow-[0_10px_22px_-6px_rgb(0_0_0/0.45),0_4px_8px_-2px_rgb(0_0_0/0.3),inset_0_1.5px_0_rgb(255_255_255/0.45),inset_0_-3px_6px_rgb(0_0_0/0.16)] transition-[transform,box-shadow,filter] duration-100 hover:brightness-95 active:translate-y-0.5 active:shadow-[0_4px_10px_-4px_rgb(0_0_0/0.4),0_1px_3px_rgb(0_0_0/0.3),inset_0_1px_0_rgb(255_255_255/0.3),inset_0_-1px_3px_rgb(0_0_0/0.2)] motion-reduce:transition-none sm:static sm:size-auto sm:translate-x-0 sm:rounded-xl sm:px-4 sm:py-2 sm:shadow-none sm:active:translate-y-0 sm:active:shadow-none"
        title="Add something (N)"
        aria-label="Add something"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          aria-hidden
          className="size-6 sm:size-4"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="hidden sm:inline">Add</span>
      </button>

      {open && when && (
        <EntryDialog
          entry={null}
          prefill={when}
          artists={artists}
          timezone={timezone}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
