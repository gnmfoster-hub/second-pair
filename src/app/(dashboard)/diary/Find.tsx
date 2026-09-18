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
  const wrap = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState("");
  /*
   * The answer and the question it was asked, together.
   *
   * Keeping only the rows meant they belonged to whatever had been typed most
   * recently, which is not true while a query is in flight — so a third letter
   * showed the results for two for a moment. Holding the term they answer lets
   * the render decide whether they are still worth showing, instead of an
   * effect reaching back to clear them.
   */
  const [answer, setAnswer] = useState<{ term: string; rows: Found[] } | null>(null);
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
    if (wanted.length < 2) return;

    let current = true;

    const timer = setTimeout(async () => {
      const rows = await findInDiary(wanted).catch(() => []);
      if (current) setAnswer({ term: wanted, rows });
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, open]);

  /*
   * Clicking away closes it, like every other search box anybody has used.
   *
   * There was Escape and a Close button and nothing else, so the only ways out
   * were the two a mouse does not reach for. It stayed open over the date and
   * the view controls until somebody found the word Close — which is the sort
   * of thing that reads as the page being stuck.
   *
   * pointerdown rather than click, so it closes as the finger goes down and
   * does not swallow the first tap on whatever was being reached for.
   */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setTerm("");
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

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
     * Over the row rather than in it, and stopping short of the right edge.
     *
     * Covering the row is the point: the date and the view buttons go under
     * this for as long as it is open and the page does not move by a pixel.
     *
     * But it covered the whole row, and Add is a sibling of the row rather
     * than part of it, so Add painted straight over the search field with no
     * gap between them — measured, the button sat a hundred and six pixels
     * inside the field. Two controls in the same space reads as something
     * broken rather than as something open.
     *
     * Stopping short also leaves Add reachable while a search is running,
     * which is the better behaviour anyway: looking somebody up and then
     * adding them is one of the likelier pairs of things to do in a diary.
     */
    <div
      ref={wrap}
      className="absolute inset-y-0 left-0 right-0 z-30 flex items-center gap-2 bg-background px-4 sm:right-28 sm:px-8"
    >
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
          {answer?.term !== term.trim() ? (
            <p className="hint px-3.5 py-3">Looking…</p>
          ) : answer.rows.length === 0 ? (
            <p className="hint px-3.5 py-3">
              Nobody by that name has anything booked from today onwards.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {answer.rows.map((row) => (
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.who}</span>
                      {/*
                        * What it is and whose chair, which the action has
                        * always worked out and nothing showed.
                        *
                        * Without it a search for "colour" returns a list of
                        * names with no clue why any of them matched — and two
                        * appointments for the same person on the same day are
                        * two identical rows.
                        */}
                      {row.what && (
                        <span className="hint block truncate text-xs">{row.what}</span>
                      )}
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
