"use client";

import { useState, useTransition } from "react";
import { setDiaryLayout } from "./actions";
import type { DiaryLayout } from "@/lib/diaryLayout";

/**
 * Which shape the diary is in.
 *
 * The grid is the only place an appointment can be dragged from one person's
 * column into another's, and a phone could not reach it: the two shapes were
 * picked by screen width with no way to say otherwise. That is a sensible
 * default and a bad rule — moving a client to a different stylist happens at
 * the desk, phone in hand, far more often than it happens at a laptop.
 *
 * Only shown to a business with more than one person. On a solo diary the
 * grid's column-per-person is a column, the list says the same thing in less
 * space, and the toolbar on a phone has already had to be fought for twice;
 * a control that can only ever do nothing does not get to take room from Add.
 */
export function LayoutToggle({ current }: { current: DiaryLayout | null }) {
  // Held locally so the button lights up on the tap, not on the round trip.
  const [chosen, setChosen] = useState<DiaryLayout | null>(current);
  const [, save] = useTransition();

  /*
   * Nothing chosen yet, so the highlight has to say what the width is doing.
   *
   * The server cannot know how wide the screen is, and guessing "list" would
   * light the wrong half of the control on every desktop — a segmented control
   * claiming the diary is a list while the reader is looking at columns. So
   * until somebody picks, each button is lit by the same breakpoint that picks
   * the shape, in CSS, which is the one thing that always agrees with what is
   * actually on the page. No JavaScript, and nothing to mis-hydrate.
   */
  const litWhenUnset: Record<DiaryLayout, string> = {
    list: "bg-surface-2 text-foreground sm:bg-transparent sm:text-muted sm:hover:text-foreground",
    grid: "text-muted hover:text-foreground sm:bg-surface-2 sm:text-foreground",
  };

  const pick = (layout: DiaryLayout) => {
    if (layout === chosen) return;
    setChosen(layout);
    save(() => {
      void setDiaryLayout(layout);
    });
  };

  return (
    <div
      className="flex overflow-hidden rounded-xl border border-border bg-surface"
      role="group"
      aria-label="Diary shape"
    >
      {(
        [
          {
            value: "list" as const,
            label: "List",
            hint: "One after another, as an agenda",
            icon: (
              <>
                <circle cx="5" cy="7" r="1.4" fill="currentColor" />
                <circle cx="5" cy="12" r="1.4" fill="currentColor" />
                <circle cx="5" cy="17" r="1.4" fill="currentColor" />
                <path
                  d="M9.5 7h9M9.5 12h9M9.5 17h9"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </>
            ),
          },
          {
            value: "grid" as const,
            label: "Columns",
            hint: "A column each, to drag between people",
            icon: (
              <>
                <rect
                  x="3.2"
                  y="4.2"
                  width="17.6"
                  height="15.6"
                  rx="2.2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path d="M9 4.6v14.8M15 4.6v14.8" stroke="currentColor" strokeWidth="1.7" />
              </>
            ),
          },
        ]
      ).map((shape, i) => (
        <button
          key={shape.value}
          type="button"
          onClick={() => pick(shape.value)}
          /* Nothing is pressed until somebody presses it; before that the
             diary is following the screen, not a choice. */
          aria-pressed={chosen === shape.value}
          title={shape.hint}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors sm:px-3.5 sm:py-2 ${
            i > 0 ? "border-l border-border" : ""
          } ${
            chosen === null
              ? litWhenUnset[shape.value]
              : chosen === shape.value
                ? "bg-surface-2 text-foreground"
                : "text-muted hover:text-foreground"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            {shape.icon}
          </svg>
          {/*
            * The word only where there is room for it. At 390px this control
            * shares a row with three view buttons, the colour picker and Add,
            * and Add has twice been pushed onto a line of its own by less
            * than this. The icons carry it; the title and aria-label carry
            * the meaning for anybody who needs it spelled out.
            */}
          <span className="hidden lg:inline">{shape.label}</span>
        </button>
      ))}
    </div>
  );
}
