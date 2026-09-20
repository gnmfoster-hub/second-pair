"use client";

import { useActionState, useState } from "react";
import { saveClientTiming, type TimingState } from "./timingActions";
import type { Service } from "@/lib/types";

/** What a stored row looks like once it is on a client. */
export type ClientTiming = {
  service_id: string;
  minutes_delta: number;
  chargeable: boolean;
  note: string | null;
};

/**
 * How long this person actually takes, as against the book.
 *
 * The knowledge already exists in every salon and is held entirely in people's
 * heads: thick hair that needs twenty minutes more, somebody who cannot sit
 * still, a regular who is always quicker than the list says. It is why a diary
 * that looks right on Monday morning is running forty minutes late by three.
 *
 * Written on the client rather than the booking, because it is true of them
 * wherever they go and whoever does the work — and per service, because it is
 * twenty minutes on a colour and nothing at all on a fringe trim.
 *
 * None of it is ever shown to the client. Nobody wants to be the appointment
 * that needs extra time, and a client who reads "always 20 minutes over" about
 * themselves is a client you have lost.
 *
 * What this does NOT yet do is change what the assistant offers. The assistant
 * quotes and books from price bands and has never read the services table, so a
 * row here is read by people and not by it. Saying otherwise on the screen
 * would be the worst of both: somebody trusting the diary to have allowed for
 * it, and the diary not having.
 */
export function Timings({
  contactId,
  firstName,
  services,
  timings,
}: {
  contactId: string;
  firstName: string;
  services: Service[];
  timings: ClientTiming[];
}) {
  const [adding, setAdding] = useState(false);
  const set = new Map(timings.map((t) => [t.service_id, t]));
  const named = (id: string) => services.find((s) => s.id === id)?.name ?? "a service";

  // Only what is not already recorded, so the picker cannot offer a duplicate.
  const spare = services.filter((s) => !set.has(s.id));

  if (services.length === 0) return null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title text-sm">How long {firstName} takes</h2>
          <p className="hint mt-1 max-w-prose">
            Only where they differ from the book, so whoever takes the booking sets aside
            the right amount of time, whether or not they are the one who learned
            it. Never shown to {firstName}.
          </p>
        </div>
        {spare.length > 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-ghost shrink-0">
            Add a service
          </button>
        )}
      </div>

      {timings.length === 0 && !adding && (
        <p className="hint mt-4">
          Nothing recorded, so {firstName} is booked the same as anybody else.
        </p>
      )}

      {timings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {timings.map((t) => (
            <TimingRow
              key={t.service_id}
              contactId={contactId}
              name={named(t.service_id)}
              timing={t}
            />
          ))}
        </ul>
      )}

      {adding && spare.length > 0 && (
        <div className="mt-4">
          <TimingRow contactId={contactId} choices={spare} onDone={() => setAdding(false)} />
        </div>
      )}
    </section>
  );
}

/**
 * One line of it, opened for editing.
 *
 * Collapsed by default because a client who needs longer for three things
 * should read as three short facts, not three forms. The note is the part
 * worth reading at a glance — it is the reason, in the words of whoever
 * learned it.
 */
function TimingRow({
  contactId,
  name,
  timing,
  choices,
  onDone,
}: {
  contactId: string;
  name?: string;
  timing?: ClientTiming;
  /** Set only when adding: which services are still unspoken for. */
  choices?: Service[];
  onDone?: () => void;
}) {
  const [state, action] = useActionState<TimingState, FormData>(saveClientTiming, {});
  const [open, setOpen] = useState(Boolean(choices));

  if (state.ok && onDone) queueMicrotask(onDone);

  if (!open && timing) {
    return (
      <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-2/40 px-3.5 py-2.5">
        <span className="font-medium">{name}</span>
        <span className="tabular-nums text-muted">
          {timing.minutes_delta > 0 ? `+${timing.minutes_delta}` : timing.minutes_delta} min
        </span>
        {timing.chargeable && <span className="pill bg-surface-2 text-muted">charged</span>}
        {timing.note && <span className="hint min-w-0 truncate">{timing.note}</span>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto text-sm text-muted hover:text-foreground"
        >
          Edit
        </button>
      </li>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-border bg-surface-2/40 p-4">
      <input type="hidden" name="contact_id" value={contactId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Which service</span>
          {choices ? (
            <select name="service_id" className="input" required defaultValue="">
              <option value="" disabled>
                Pick one
              </option>
              {choices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.minutes != null ? ` — ${s.minutes} min` : ""}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="service_id" value={timing!.service_id} />
              <div className="input bg-surface-2/60">{name}</div>
            </>
          )}
        </label>

        <label>
          <span className="label">Minutes on top</span>
          <input
            name="minutes_delta"
            type="number"
            step={5}
            defaultValue={timing?.minutes_delta ?? ""}
            placeholder="20"
            className="input"
            autoFocus
          />
          <span className="hint">
            A minus number is real and useful, some people are quicker than the
            book says. Zero takes the row off.
          </span>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="label">Why, in your own words</span>
        <input
          name="note"
          defaultValue={timing?.note ?? ""}
          placeholder="Always runs over, allow extra time"
          className="input"
        />
        <span className="hint">
          For whoever picks this up when you are off. Never shown to the client.
        </span>
      </label>

      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="chargeable"
          defaultChecked={timing?.chargeable ?? false}
          className="mt-0.5"
        />
        <span>
          Charge for the extra time
          <span className="hint block">
            Off unless you say otherwise, and nothing is ever added to a bill on its own.
            More time is not always more work, and you are the one who knows which this
            is.
          </span>
        </span>
      </label>

      {state.error && <p className="mt-3 text-sm text-warn">{state.error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn bg-accent text-on-accent">Save</button>
        <button
          type="button"
          onClick={() => (onDone ? onDone() : setOpen(false))}
          className="btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
