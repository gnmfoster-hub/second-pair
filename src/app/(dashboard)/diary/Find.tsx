"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { findInDiary, type Found } from "./findActions";

/**
 * Finding somebody in the diary, for no vertical space at all.
 *
 * The diary answers "what is happening on Thursday" and could never answer
 * "when is Mrs Patel in", which is what the phone actually asks. The obvious
 * place for a search box is a row of its own across the top, and on a phone
 * that is forty pixels of a screen whose whole problem is that appointments do
 * not fit on it.
 *
 * So it is a button the size of an icon, sitting on the row the date is
 * already on, and the field it opens covers that row rather than pushing it
 * down. Nothing moves, on any screen, whether it is open or shut. The results
 * hang over the diary for the same reason.
 */
export function Find() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [looking, setLooking] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  // Focus on opening, and on a phone that is also what raises the keyboard.
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  /*
   * Asked after somebody stops typing, not on every letter.
   *
   * Three hundred milliseconds is about the gap between letters and the gap
   * between words, so a name typed straight through is one query rather than
   * nine. The result of a slower query landing after a faster one is dropped
   * by the id check, so a stale answer cannot overwrite a fresh one.
   */
  useEffect(() => {
    if (!open) return;

    const wanted = term.trim();
    if (wanted.length < 2) {
      setFound(null);
      return;
    }

    let current = true;
    setLooking(true);

    const timer = setTimeout(async () => {
      const rows = await findInDiary(wanted).catch(() => []);
      if (!current) return;
      setFound(rows);
      setLooking(false);
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, open]);

  // Escape closes it, like every other search box anybody has used.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setTerm("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Find somebody in the diary"
        className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
          <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    /*
     * Over the row rather than in it. `absolute inset-0` against the header's
     * own box, so the date and the buttons underneath are covered for as long
     * as this is open and the page does not move by a pixel.
     */
    <div className="absolute inset-0 z-30 flex items-center gap-2 bg-background px-4 sm:px-8">
      <input
        ref={box}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Find somebody in the diary…"
        className="input h-9 flex-1 text-sm"
        aria-label="Find somebody in the diary"
      />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTerm("");
        }}
        className="btn-ghost shrink-0 py-1.5 text-sm"
      >
        Close
      </button>

      {term.trim().length >= 2 && (
        <div className="absolute left-4 right-4 top-full mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg sm:left-8 sm:right-8">
          {found === null || looking ? (
            <p className="hint px-3.5 py-3">Looking…</p>
          ) : found.length === 0 ? (
            <p className="hint px-3.5 py-3">
              Nobody by that name has anything booked from today onwards.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {found.map((row) => (
                <li key={row.id}>
                  {/*
                    * Straight to the appointment, open. The diary takes an
                    * entry id in its address, so finding somebody and seeing
                    * their booking are the same tap.
                    */}
                  <Link
                    href={`/diary?day=${row.day}&entry=${row.id}`}
                    onClick={() => setOpen(false)}
                    className="row flex items-baseline gap-3 px-3.5 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {row.who}
                    </span>
                    <span className="hint shrink-0 text-xs">{row.when}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
