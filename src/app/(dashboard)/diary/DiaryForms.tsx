"use client";

import { useActionState, useState } from "react";
import { addDiaryEntry, moveDiaryEntry, cancelDiaryEntry, type DiaryState } from "./actions";
import { Field, SubmitButton } from "@/components/Form";
import type { Artist } from "@/lib/types";

function Message({ state }: { state: DiaryState }) {
  if (state.error) return <p className="text-sm text-accent">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-ok">{state.ok}</p>;
  return null;
}

/** Adding a booking by hand, or blocking time out entirely. */
export function AddEntry({
  artists,
  practitioner,
}: {
  artists: Artist[];
  /** What this trade calls the person doing the work. */
  practitioner: string;
}) {
  const [state, action] = useActionState<DiaryState, FormData>(addDiaryEntry, {});
  const [isBlock, setIsBlock] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <details className="card">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm">
        + Add to the diary
      </summary>

      <form action={action} className="space-y-5 border-t border-border p-5">
        <div className="flex gap-4">
          {[
            { value: "manual", label: "An appointment" },
            { value: "block", label: "Block time out" },
          ].map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="source"
                value={option.value}
                checked={isBlock === (option.value === "block")}
                onChange={() => setIsBlock(option.value === "block")}
                className="accent-[var(--accent)]"
              />
              {option.label}
            </label>
          ))}
        </div>

        <p className="hint">
          {isBlock
            ? "Holiday, lunch, admin — anything you are not available for. The assistant will never offer this time."
            : "A walk-in or a phone booking. Takes the slot out of what the assistant can offer."}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isBlock ? "What for" : "Who for"}>
            <input
              name="title"
              className="input"
              placeholder={isBlock ? "Dentist" : "Gary — small rose, wrist"}
              required
            />
          </Field>
          <Field label={practitioner.replace(/^./, (c) => c.toUpperCase())}>
            <select name="artist_id" className="input" required>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <input type="date" name="date" defaultValue={today} className="input" required />
          </Field>
          <Field label="Start">
            <input type="time" name="start_time" defaultValue="10:00" className="input" required />
          </Field>
          <Field label="Minutes">
            <input
              type="number"
              name="minutes"
              min={5}
              max={1440}
              step={15}
              defaultValue={60}
              className="input"
              required
            />
          </Field>
        </div>

        {!isBlock && (
          <Field label="Type">
            <select name="type" className="input max-w-40">
              <option value="session">Session</option>
              <option value="consultation">Consultation</option>
            </select>
          </Field>
        )}

        <Field label="Notes" hint="Only you see these.">
          <textarea name="notes" rows={2} className="input" />
        </Field>

        <div className="flex items-center gap-4">
          <SubmitButton>{isBlock ? "Block it out" : "Add it"}</SubmitButton>
          <Message state={state} />
        </div>
      </form>
    </details>
  );
}

/** Moving one entry to another time, keeping its length. */
export function MoveEntry({
  id,
  startsAt,
  timezone,
}: {
  id: string;
  startsAt: string;
  timezone: string;
}) {
  const [state, action] = useActionState<DiaryState, FormData>(moveDiaryEntry, {});
  const [open, setOpen] = useState(false);

  // Prefill with the current slot, expressed where the studio is.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(startsAt));
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const date = `${at.year}-${at.month}-${at.day}`;
  const time = `${at.hour === "24" ? "00" : at.hour}:${at.minute}`;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="hint hover:text-foreground">
        Move
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="date" name="date" defaultValue={date} className="input w-40 py-1" />
      <input type="time" name="start_time" defaultValue={time} className="input w-28 py-1" />
      <SubmitButton className="btn-ghost">Move</SubmitButton>
      <button type="button" onClick={() => setOpen(false)} className="hint hover:text-foreground">
        Cancel
      </button>
      <Message state={state} />
    </form>
  );
}

export function CancelEntry({ id, label }: { id: string; label: string }) {
  return (
    <form action={cancelDiaryEntry}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="hint hover:text-accent" aria-label={`Cancel ${label}`}>
        Cancel
      </button>
    </form>
  );
}
