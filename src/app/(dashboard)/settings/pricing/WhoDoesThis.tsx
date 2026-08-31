"use client";

import { useState, useTransition } from "react";
import { setServiceProviders } from "../actions";
import type { Artist } from "@/lib/types";

/**
 * Who in the business offers this service.
 *
 * "Everyone" is the default and stays the default — a shop where all the
 * stylists cut hair never touches this, and one that has a nail technician or
 * a piercer names only the services that need it.
 *
 * The consequence is worth stating plainly on screen, because it is the whole
 * point: the assistant will not offer this to anyone not ticked, quote it at
 * their rate, or put it in their diary.
 */
export function WhoDoesThis({
  bandId,
  label,
  team,
  current,
}: {
  bandId: string;
  label: string;
  team: Artist[];
  /** Empty means everybody, which is what almost every service is. */
  current: string[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(current);
  const [saving, save] = useTransition();

  // Only worth asking in a business with more than one person in it.
  if (team.length < 2) return null;

  const everyone = chosen.length === 0 || chosen.length === team.length;

  const commit = (next: string[]) => {
    // Everybody ticked means everybody, which is stored as nobody named.
    const value = next.length === team.length ? [] : next;
    setChosen(value);
    save(async () => {
      await setServiceProviders(bandId, value);
    });
  };

  const toggle = (id: string) => {
    const base = chosen.length ? chosen : team.map((a) => a.id);
    commit(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  const named = team.filter((a) => chosen.includes(a.id));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`text-xs transition-colors ${
          everyone ? "text-muted hover:text-foreground" : "font-medium text-accent"
        }`}
        title={`Who does ${label}`}
      >
        {saving
          ? "Saving…"
          : everyone
            ? "Everyone"
            : named.length === 1
              ? named[0].name
              : `${named.length} people`}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close"
            tabIndex={-1}
          />
          <div className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-pop)]">
            <div className="border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Who does this
            </div>

            <button
              type="button"
              onClick={() => commit([])}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors ${
                everyone ? "bg-accent/10" : "hover:bg-surface-2"
              }`}
            >
              <Tick on={everyone} />
              Everyone
            </button>

            <div className="border-t border-border">
              {team.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => toggle(person.id)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                >
                  <Tick on={!everyone && chosen.includes(person.id)} />
                  {person.name}
                </button>
              ))}
            </div>

            <p className="border-t border-border bg-surface-2/50 px-3.5 py-2 text-[11px] leading-relaxed text-muted">
              The assistant only offers this to the people ticked, and quotes it at their
              rate.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={`grid size-4 shrink-0 place-items-center rounded border ${
        on ? "border-accent bg-accent text-white" : "border-border"
      }`}
      aria-hidden
    >
      {on && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4 4L19 7" />
        </svg>
      )}
    </span>
  );
}
