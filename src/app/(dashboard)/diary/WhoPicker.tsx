"use client";

import { useState } from "react";
import Link from "next/link";
import { colourForName } from "@/lib/diaryColour";
import type { Artist } from "@/lib/types";

/**
 * Whose diary you are looking at, once there are too many to show as chips.
 *
 * A row of chips is the right control for a handful of people: every name
 * visible, one tap to any of them, nothing to learn. It stops being that at
 * about five, when the row runs off the side of a phone and the last stylists
 * are hidden behind a sideways scroll nobody is told about — measured on a
 * five-chair salon, where Chloe was clipped and Jade was not on the screen at
 * all.
 *
 * So past that it becomes what it should be at that size: a picker that names
 * who you are looking at and opens a list of everybody. One tap becomes two,
 * which is the right trade against a name you cannot find.
 *
 * Links rather than state, like the chips it replaces — whose diary this is
 * belongs in the address, so it survives a reload and can be sent to somebody.
 *
 * It is given the pieces of the address rather than something that builds one.
 * The first version took a hrefFor(id) callback, which is the obvious shape and
 * is not allowed: the page rendering this is a server component, and a function
 * cannot be serialised across that boundary. It threw on render — so the diary
 * returned a server error for any business with more than four people, which
 * was none of them until the demo salon existed. Nothing in the product had
 * ever run the line.
 */
export function WhoPicker({
  team,
  focused,
  view,
  anchor,
  colourByPerson,
}: {
  team: Artist[];
  /** The id being shown, or null for everybody. */
  focused: string | null;
  /** Which view the links should stay in. */
  view: "day" | "week";
  /** The day or the week start, as YYYY-MM-DD. */
  anchor: string;
  /** Whether a dot in their colour means anything here. */
  colourByPerson: boolean;
}) {
  const [open, setOpen] = useState(false);

  const hrefFor = (id: string | null) =>
    view === "day"
      ? `/diary?view=day&day=${anchor}${id ? `&who=${id}` : ""}`
      : `/diary?view=week&week=${anchor}${id ? `&who=${id}` : ""}`;

  const person = focused ? team.find((a) => a.id === focused) : null;
  const colourOf = (a: Artist) => a.colour || colourForName(a.name);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-8 items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:text-foreground"
      >
        {person && colourByPerson && (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: colourOf(person) }}
            aria-hidden
          />
        )}
        <span>{person ? person.name : "Everyone"}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <>
          {/* Tap anywhere else to dismiss, without a library. */}
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close"
            tabIndex={-1}
          />

          <div
            className="absolute left-0 z-50 mt-2 max-h-[60vh] w-56 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-surface py-1 shadow-[var(--shadow-pop)]"
            role="menu"
          >
            <Link
              href={hrefFor(null)}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors hover:bg-surface-2 ${
                !focused ? "font-semibold" : ""
              }`}
              role="menuitem"
            >
              Everyone
              {!focused && (
                <span aria-hidden className="ml-auto text-accent">
                  ✓
                </span>
              )}
            </Link>

            <div className="my-1 border-t border-border" />

            {team.map((a) => (
              <Link
                key={a.id}
                href={hrefFor(a.id)}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors hover:bg-surface-2 ${
                  focused === a.id ? "font-semibold" : ""
                }`}
                role="menuitem"
              >
                {/*
                  * Always a dot here, even when the diary is coloured by
                  * something else. In a list of ten names it is what the eye
                  * finds, and it is the same colour their column carries.
                  */}
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: colourOf(a) }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{a.name}</span>
                {focused === a.id && (
                  <span aria-hidden className="ml-auto text-accent">
                    ✓
                  </span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
