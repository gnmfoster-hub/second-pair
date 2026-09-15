"use client";

import Link from "next/link";
import { formatPence } from "@/lib/money";
import { depositPaid, hasDeposit } from "@/lib/deposit";
import type { Entry } from "./WeekGrid";
import { capital, type Words } from "@/lib/wordsText";
import { FormFirst, SendAnyForm } from "./FormFirst";

/**
 * An appointment, as it is when you tap it.
 *
 * Tapping one used to open the form for changing it: who it is for, their
 * history, the whole price list, the price, the date, the time, the length and
 * who is doing it — and Complete, the thing somebody at the desk had actually
 * tapped for, three screens further down underneath all of that. On a phone
 * that is a form to scroll past with the client standing in front of you, and
 * it was reported as "no complete button" while being on the screen.
 *
 * So the first thing is the appointment itself, read rather than edited, and
 * the one or two things you do to it. Changing it is a tap away and gets the
 * whole sheet to itself; so does completing it.
 */
export function Glance({
  entry,
  timezone,
  words,
  whoName,
  due,
  onComplete,
  onChange,
}: {
  entry: Entry;
  timezone: string;
  /** What this business calls things, from its trade and its own changes. */
  words: Words;
  /** Whose column it sits in. */
  whoName: string | null;
  /** Whether it is today or earlier, which is when it can be completed. */
  due: boolean;
  onComplete: () => void;
  onChange: () => void;
}) {
  const start = new Date(entry.starts_at);
  const end = new Date(entry.ends_at);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);

  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);
  const time = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(d)
      .replace(" ", "")
      .toLowerCase();

  const length =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
      : `${minutes}m`;

  const who = entry.clientName ?? entry.title ?? capital(words.service);
  // The service, unless the title is only the client's name said again.
  const what =
    entry.title && entry.title.trim().toLowerCase() !== (entry.clientName ?? "").trim().toLowerCase()
      ? entry.title
      : null;
  const pence = entry.price_pence ?? entry.quotePence;
  const address = [entry.job_address, entry.job_postcode].filter(Boolean).join(", ");

  return (
    <div className="mt-2">
      <div className="text-2xl font-semibold leading-tight">{who}</div>
      {what && <div className="mt-1 text-base">{what}</div>}

      <div className="mt-2 text-sm">
        {day} · {time(start)}–{time(end)} <span className="hint">({length})</span>
      </div>
      <div className="hint mt-0.5 text-sm">
        {whoName ? `With ${whoName}` : null}
        {whoName && pence != null ? " · " : null}
        {pence != null ? formatPence(pence) : null}
      </div>

      {/* Where it stands, in as few words as it takes. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {entry.attended === true && (
          <span className="pill bg-ok/10 text-ok">
            Completed{entry.soldPence ? ` · ${formatPence(entry.soldPence)} taken` : ""}
          </span>
        )}
        {entry.attended === false && <span className="pill bg-warn/10 text-warn">No-show</span>}
        {hasDeposit(entry) && (
          <span className={`pill ${depositPaid(entry) ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
            Deposit {formatPence(entry.deposit_amount_pence ?? 0)}{" "}
            {depositPaid(entry) ? "paid" : "not paid"}
          </span>
        )}
      </div>

      {entry.formNeed && entry.contactId && (
        <FormFirst need={entry.formNeed} contactId={entry.contactId} bookingId={entry.id} />
      )}
      {!entry.formNeed && entry.contactId && (
        <div className="mt-3">
          <SendAnyForm contactId={entry.contactId} bookingId={entry.id} />
        </div>
      )}

      {entry.description && <p className="hint mt-3 text-sm">{entry.description}</p>}
      {entry.notes && <p className="mt-2 rounded-lg bg-surface-2/60 px-3 py-2 text-sm">{entry.notes}</p>}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {entry.clientPhone && (
          <a href={`tel:${entry.clientPhone.replace(/\s/g, "")}`} className="text-accent tabular-nums hover:underline">
            {entry.clientPhone}
          </a>
        )}
        {address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            {address}
          </a>
        )}
      </div>

      {/*
        * The thing you came to do, and the size of a thumb.
        *
        * From the morning of the day rather than the start time, so it is
        * there while the client is still in the chair.
        */}
      <div className="mt-5 space-y-2">
        {due ? (
          <button
            type="button"
            onClick={onComplete}
            className="btn w-full bg-accent py-3 text-base text-on-accent"
          >
            {entry.attended == null ? "Complete" : "Complete again"}
          </button>
        ) : (
          <p className="hint text-sm">Complete becomes available on the day.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onChange} className="btn w-full border border-border">
            Change or cancel
          </button>
          {entry.contactId ? (
            <Link href={`/clients/${entry.contactId}`} className="btn w-full border border-border text-center">
              Their record
            </Link>
          ) : (
            <span />
          )}
        </div>

        {entry.conversationId && (
          <Link
            href={`/conversations/${entry.conversationId}`}
            className="block pt-1 text-center text-sm text-accent hover:underline"
          >
            Open the conversation →
          </Link>
        )}
      </div>
    </div>
  );
}
