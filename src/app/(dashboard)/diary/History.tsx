"use client";

import { useState, useTransition } from "react";
import { bookingHistory, type HistoryLine } from "./actions";
import { formatPence } from "@/lib/money";

/**
 * Who booked this, and what has happened to it since.
 *
 * Giles, 15 October, about a walk in Amber's diary: "can you tell me who
 * booked this?" Julie said she had booked it; Amber said she had not. Both
 * were telling the truth, and the diary could not help either of them,
 * because a booking typed in by hand recorded nothing but the fact that it
 * was not the assistant.
 *
 * Closed until asked for, and fetched only then. It is one question about one
 * appointment, asked rarely and never while somebody is in a hurry, so it has
 * no business being in the query that draws the week.
 */
export function History({ id, timezone }: { id: string; timezone: string }) {
  const [lines, setLines] = useState<HistoryLine[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, load] = useTransition();

  function show() {
    setOpen(true);
    if (lines) return;
    load(async () => setLines(await bookingHistory(id)));
  }

  if (!open) {
    return (
      <button type="button" onClick={show} className="mt-3 text-xs text-muted underline">
        Who booked this?
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-surface-2/50 px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">History</span>
        <button type="button" onClick={() => setOpen(false)} className="text-muted underline">
          Hide
        </button>
      </div>

      {loading && !lines && <p className="hint mt-1.5">Looking.</p>}

      {lines?.length === 0 && (
        <p className="hint mt-1.5">
          Nothing recorded. This one predates the diary keeping track.
        </p>
      )}

      {lines && lines.length > 0 && (
        <ul className="mt-1.5 space-y-1.5">
          {lines.map((line, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span>{said(line, timezone)}</span>
              <span className="hint tabular-nums">{when(line.at, timezone)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "14 Oct, 9:42am", in the business's own time. */
function when(at: string, timeZone: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(t))
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
}

/** A date somebody reads, for the from and to of a move. */
function day(at: unknown, timeZone: string): string {
  if (typeof at !== "string") return "";
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(t));
}

/**
 * One line, as a sentence.
 *
 * "The assistant" rather than a name where no person acted, because the
 * alternative is a blank where somebody expects to read who it was, and a
 * blank reads as a fault.
 */
function said(line: HistoryLine, timeZone: string): string {
  const by =
    line.source === "assistant"
      ? " by the assistant"
      : line.who
        ? ` by ${line.who}`
        : "";

  const d = line.detail ?? {};

  switch (line.what) {
    case "booked":
      return `Booked${by}${typeof d.visits === "number" ? `, ${d.visits} visits in one go` : ""}.`;
    case "moved": {
      const from = day(d.from, timeZone);
      const to = day(d.to, timeZone);
      const whose = typeof d.toWhose === "string" ? `, to ${d.toWhose}` : "";
      return from && to ? `Moved${by} from ${from} to ${to}${whose}.` : `Moved${by}${whose}.`;
    }
    case "price changed": {
      const from = typeof d.from === "number" ? formatPence(d.from) : "nothing";
      const to = typeof d.to === "number" ? formatPence(d.to) : "nothing";
      return `Price changed${by} from ${from} to ${to}.`;
    }
    case "cancelled":
      return `Cancelled${by}${d.theWholeParty ? ", with the whole party" : ""}.`;
    case "finished":
      return d.attended === false ? `Marked as a no-show${by}.` : `Marked as done${by}.`;
    default:
      return `Changed${by}.`;
  }
}
