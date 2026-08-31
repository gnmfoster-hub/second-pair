"use client";

import { useState, useTransition } from "react";
import { setDiaryColour } from "./actions";
import { COLOUR_MODES, type ColourMode } from "@/lib/diaryColour";

/**
 * What the colours in the diary mean.
 *
 * A setting rather than a fixed choice, because the right answer depends on
 * the shape of the business: one person wants to see client work against admin
 * and time off, and a five-chair salon wants to see whose column is whose.
 *
 * Saved per business rather than kept in the URL — it is a preference, not a
 * view, and nobody wants to set it again every morning.
 */
export function ColourBy({ current, hasTeam }: { current: ColourMode; hasTeam: boolean }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(current);
  const [, save] = useTransition();

  const pick = (mode: ColourMode) => {
    setChosen(mode);
    setOpen(false);
    save(() => {
      void setDiaryColour(mode);
    });
  };

  const label = COLOUR_MODES.find((m) => m.value === chosen)?.label ?? "Colour";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
        title="What the colours mean"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="4.5" fill="currentColor" opacity="0.85" />
          <circle cx="15.5" cy="15" r="4.5" fill="currentColor" opacity="0.45" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <>
          {/* Click anywhere else to dismiss, without a library. */}
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close"
            tabIndex={-1}
          />

          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-pop)]">
            <div className="border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Colour by
            </div>
            {COLOUR_MODES.map((mode) => {
              // Nothing to distinguish in a one-person business.
              const useless = mode.value === "person" && !hasTeam;
              return (
                <button
                  key={mode.value}
                  type="button"
                  disabled={useless}
                  onClick={() => pick(mode.value)}
                  className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors disabled:opacity-40 ${
                    chosen === mode.value ? "bg-accent/10" : "hover:bg-surface-2"
                  }`}
                >
                  <span
                    className={`mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border ${
                      chosen === mode.value ? "border-accent bg-accent" : "border-border"
                    }`}
                  >
                    {chosen === mode.value && (
                      <span className="size-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{mode.label}</span>
                    <span className="hint mt-0.5 block">
                      {useless ? "Add someone else to the team first" : mode.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
