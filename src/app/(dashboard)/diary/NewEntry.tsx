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
        className="btn inline-flex bg-highlight px-4 font-semibold text-on-highlight transition-[filter] hover:brightness-95"
        title="Add something (N)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add
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
