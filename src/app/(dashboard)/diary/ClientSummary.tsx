"use client";

import { useEffect, useState } from "react";
import { clientSummary } from "./actions";
import { formatPence } from "@/lib/money";

type Summary = Awaited<ReturnType<typeof clientSummary>>;

/**
 * Who this is, once you have picked them.
 *
 * Most bookings in a salon are a regular having the thing they always have, so
 * the fastest booking is one tap on what they had last time — and typing it
 * out again is the product asking somebody to look up what it already knows.
 *
 * The history matters as much as the shortcut. Somebody on the phone wants to
 * say "you were in six weeks ago with Priya" without opening another screen,
 * and a no-show two visits ago is worth knowing before offering a Saturday
 * morning.
 *
 * Nothing here is shown to the client, and nothing here is a judgement. It is
 * what the salon already knows about somebody it has met.
 */
export function ClientSummary({
  contactId,
  onUsual,
}: {
  contactId: string | null;
  /** Tapping the usual picks that service in the form above. */
  onUsual: (serviceId: string) => void;
}) {
  const [found, setFound] = useState<{ id: string; summary: Summary } | null>(null);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;

    (async () => {
      const summary = await clientSummary(contactId);
      if (!cancelled) setFound({ id: contactId, summary });
    })();

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  // Held against the id it was fetched for, so a stale answer cannot be shown
  // under a newly picked name.
  const summary = found?.id === contactId ? found.summary : null;

  /*
   * Nothing to say about a stranger — but a blocking fact is worth saying even
   * about somebody whose visits are all still ahead of them, because that is
   * exactly who is being booked when this panel is on screen.
   */
  if (!contactId || !summary) return null;
  if (summary.total === 0 && summary.blocked.length === 0) return null;

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {summary.total === 0
            ? "Not been in yet"
            : `Been in ${summary.total} ${summary.total === 1 ? "time" : "times"}`}
        </span>
        {summary.noShows > 0 && (
          <span className="hint">
            {summary.noShows} did not turn up
          </span>
        )}
      </div>

      {/*
       * Anything the salon flagged about them, first and plainly. It is the
       * one thing on this panel somebody needs before they finish typing.
       */}
      {summary.alert && (
        <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          {summary.alert}
        </p>
      )}

      {/*
       * What this trade has to know before they sit down: the breed, the
       * registration, the vaccination. A blocking one that has run out or was
       * never given comes first and in the warning colour, because it is the
       * only thing on this panel that changes what happens next.
       */}
      {summary.blocked.length > 0 && (
        <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          {summary.blocked.join(". ")}. The assistant will not book them until this is sorted.
        </p>
      )}

      {summary.facts.length > 0 && (
        <p className="mt-2 text-xs text-muted">{summary.facts.join(" · ")}</p>
      )}

      {summary.usual && (
        <button
          type="button"
          onClick={() => onUsual(summary.usual!.id)}
          className="btn-ghost mt-3 w-full justify-start text-sm"
        >
          The usual — {summary.usual.name}
          <span className="hint ml-2">{summary.usual.times} times</span>
        </button>
      )}

      <ul className="mt-3 space-y-1">
        {summary.visits.map((visit, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
            <span className="tabular-nums">{when(visit.at)}</span>
            {visit.what && <span className="text-foreground">{visit.what}</span>}
            {visit.with && <span>with {visit.with}</span>}
            {visit.pence != null && (
              <span className="ml-auto tabular-nums">{formatPence(visit.pence)}</span>
            )}
            {visit.attended === false && <span className="text-warn">no-show</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
