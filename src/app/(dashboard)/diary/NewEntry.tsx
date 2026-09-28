"use client";

import { useEffect, useState } from "react";
import { nextHalfHour } from "@/lib/calendar";
import { EntryDialog } from "./EntryDialog";
import type { Words } from "@/lib/wordsText";
import { AddMenu } from "./AddMenu";
import type { Bookable } from "./ServicePick";
import type { Artist } from "@/lib/types";

/**
 * The obvious way to add something.
 *
 * Until this existed the only route was clicking an empty part of the grid,
 * which is a fine shortcut once you know it and completely undiscoverable
 * before. A calendar with no visible add button looks unfinished, whatever
 * else it can do.
 *
 * It opens on the day being looked at, at the next half hour when that day is
 * today, because that is nearly always what somebody adding an appointment
 * means.
 */
export function NewEntry({
  artists,
  timezone,
  services,
  words,
  day,
  today,
  openOnArrival,
}: {
  artists: Artist[];
  timezone: string;
  /** What the business sells, where it keeps a named list. Empty otherwise. */
  services: Bookable[];
  /** What this business calls things, from its trade and its own changes. */
  words: Words;
  /**
   * The day the diary is showing, as YYYY-MM-DD, worked out on the server in
   * the business's own timezone. See the call site for how week and month view
   * answer a question that is really about a range.
   */
  day: string;
  /** Today where the business is, so the clock is only used when it applies. */
  today: string;
  /**
   * Whether the address said ?add=1, read on the server.
   *
   * The home-screen shortcut. This used to be read here in an effect, which
   * then called setState in the effect body — a lint error this file has been
   * failing on since the shortcut was built, and a real cascading render as
   * well. It is a prop now: the server already reads the address, so the first
   * render can simply be the one with the sheet open. No effect, and no
   * difference between what the server drew and what the browser expected.
   */
  openOnArrival?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState<{ date: string; time: string } | null>(null);

  /*
   * Who it is for, asked before anything else.
   *
   * The form used to open straight onto a title and a length, which quietly
   * decides that this is one person and that whoever is typing knows how long
   * the job takes. Asking who first is what makes a client's own recorded
   * timing usable at all — it cannot set aside her extra twenty minutes until
   * it knows it is her.
   */
  const [asking, setAsking] = useState(openOnArrival === true);
  const [kind, setKind] = useState<"client" | "walkin" | "other">("walkin");

  /*
   * The day comes from the page; only the time comes from the clock.
   *
   * The clock is still read on click rather than in render, for the reason it
   * always was: it is not a pure value, and a server-rendered "now" would be
   * wrong by the time it arrived. What changed is that it no longer decides the
   * *date*. It used to, which is the whole bug — the diary could be showing the
   * 14th of October and this would quietly hand the dialog today.
   *
   * "The next half hour" only means anything on today. On any other day there
   * is no next half hour, so it opens at ten, which is what the dialog has
   * always fallen back to when nothing prefilled it. Deliberately not the
   * business's first opening time: this component is not given the hours, and
   * reading them to save one tap is not worth another round trip on the screen
   * people open twenty times a day.
   */
  const start = () => setAsking(true);

  /*
   * The time is settled here rather than when the sheet opens.
   *
   * Once per dialog, at the moment the kind is chosen, so it cannot drift while
   * somebody reads the menu — and so nothing is computed during render, where
   * reading a clock would give the server and the browser different answers.
   */
  function chose(picked: "client" | "walkin" | "other") {
    setKind(picked);
    setWhen({ date: day, time: day === today ? nextHalfHour(timezone) : "10:00" });
    setAsking(false);
    setOpen(true);
  }

  /*
   * The shortcut's parameter taken back out of the address.
   *
   * Long-pressing the app icon offers "Add an appointment", and a shortcut that
   * lands on the diary and leaves you to find the button is not a shortcut, it
   * is a link with a promise on it. Whether to open is decided on the server
   * now (see openOnArrival); all that is left here is tidying the address, so a
   * refresh or a press of Back does not open the sheet a second time.
   *
   * This is the shape the effect always wanted: it updates an external system —
   * the browser's history — and touches no React state at all.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("add") !== "1") return;
    url.searchParams.delete("add");
    window.history.replaceState({}, "", url.pathname + url.search);
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

      {asking && (
        <AddMenu
          words={words}
          byList={services.length > 0}
          onPick={chose}
          onClose={() => setAsking(false)}
        />
      )}

      {open && when && (
        <EntryDialog
          words={words}
          entry={null}
          prefill={when}
          artists={artists}
          timezone={timezone}
          services={services}
          adding={kind}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
