"use client";

import { useEffect, useRef, useState } from "react";
import { findClients } from "./actions";

/**
 * Who a booking is for.
 *
 * Search-as-you-type over existing clients, with the option to add a new one
 * without leaving the form. Both matter: a salon booking a regular over the
 * phone should not create a second Marie Whitlock, and one booking a stranger
 * should not have to go and make a client record first.
 *
 * The whole point is that a phone booking builds the same client history an
 * assistant booking does — spend, no-shows, notes, and the alert that flags on
 * every future enquiry.
 */
export type ClientChoice = {
  id: string | null;
  name: string;
  phone?: string | null;
};

type Match = { id: string; name: string | null; phone: string | null; alert: string | null };

export function ClientPicker({
  defaultValue,
}: {
  defaultValue?: { id: string | null; name: string | null } | null;
}) {
  const [query, setQuery] = useState(defaultValue?.name ?? "");
  const [chosen, setChosen] = useState<ClientChoice | null>(
    defaultValue?.name ? { id: defaultValue.id, name: defaultValue.name } : null,
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Debounced, because this hits the database on every keystroke otherwise and
  // a salon owner types faster than a round trip.
  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) {
      // Cleared on a timer rather than synchronously: setting state during the
      // effect itself makes React re-render before it has finished the first.
      const clear = setTimeout(() => setMatches([]), 0);
      return () => clearTimeout(clear);
    }
    const timer = setTimeout(async () => {
      setMatches(await findClients(term));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const pick = (match: Match) => {
    setChosen({ id: match.id, name: match.name ?? "", phone: match.phone });
    setQuery(match.name ?? "");
    setOpen(false);
  };

  const asNew = () => {
    setChosen({ id: null, name: query.trim() });
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      {/* What the form actually submits. */}
      <input type="hidden" name="contact_id" value={chosen?.id ?? ""} />
      <input type="hidden" name="contact_name" value={chosen?.name ?? ""} />

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setChosen(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search, or type a new name"
        className="input"
        autoComplete="off"
      />

      {chosen && (
        <p className="hint mt-1.5">
          {chosen.id ? (
            <>
              Booking for <strong className="text-foreground">{chosen.name}</strong> — their
              history will show this.
            </>
          ) : (
            <>
              <strong className="text-foreground">{chosen.name}</strong> will be added to
              your clients.
            </>
          )}
        </p>
      )}

      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-pop)]">
          {matches.map((match) => (
            <button
              key={match.id}
              type="button"
              onClick={() => pick(match)}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {match.name ?? "Unnamed"}
                </span>
                {match.phone && <span className="hint num block">{match.phone}</span>}
              </span>
              {/* The thing the owner most needs to see before booking them in. */}
              {match.alert && (
                <span className="pill shrink-0 bg-warn/15 text-[10px] uppercase text-warn">
                  note
                </span>
              )}
            </button>
          ))}

          <button
            type="button"
            onClick={asNew}
            className="w-full border-t border-border px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
          >
            Add <strong>{query.trim()}</strong> as a new client
          </button>
        </div>
      )}
    </div>
  );
}
