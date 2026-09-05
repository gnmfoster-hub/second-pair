"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ClientPicker } from "./ClientPicker";
import Link from "next/link";
import { saveDiaryEntry, cancelDiaryEntry, cancelSeries, type DiaryState } from "./actions";
import { Field, SubmitButton } from "@/components/Form";
import { formatPence } from "@/lib/money";
import { CATEGORIES, OWNER_CATEGORIES, categoryFor, REPEATS } from "@/lib/calendar";
import type { Artist } from "@/lib/types";
import type { Entry } from "./WeekGrid";

/** Wall-clock date and time in the studio's zone, for form fields. */
function localFields(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${at.year}-${at.month}-${at.day}`,
    time: `${at.hour === "24" ? "00" : at.hour}:${at.minute}`,
  };
}

export function EntryDialog({
  entry,
  prefill,
  artists,
  timezone,
  onClose,
}: {
  entry: Entry | null;
  prefill: { date: string; time: string; endTime?: string; artistId?: string } | null;
  artists: Artist[];
  timezone: string;
  onClose: () => void;
}) {
  const [state, action] = useActionState<DiaryState, FormData>(saveDiaryEntry, {});
  const dialog = useRef<HTMLDivElement>(null);

  const existing = Boolean(entry);
  const fromClient = entry?.source === "assistant";

  const startFields = entry
    ? localFields(entry.starts_at, timezone)
    : { date: prefill?.date ?? "", time: prefill?.time ?? "10:00" };

  /*
   * How long it runs.
   *
   * An existing entry knows. A slot dragged out on the grid knows, because the
   * drag said so — opening the form at a default hour after somebody carefully
   * pulled out ninety minutes would throw away what they just told us. A plain
   * click falls back to an hour.
   */
  const dragged =
    prefill?.endTime && prefill.time
      ? (Number(prefill.endTime.slice(0, 2)) * 60 + Number(prefill.endTime.slice(3, 5))) -
        (Number(prefill.time.slice(0, 2)) * 60 + Number(prefill.time.slice(3, 5)))
      : null;

  const minutes = entry
    ? Math.round((Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) / 60000)
    : (dragged ?? 60);

  const [category, setCategory] = useState(entry?.category ?? "personal");
  const [allDay, setAllDay] = useState(entry?.all_day ?? false);
  const [repeats, setRepeats] = useState("none");
  const chosen = categoryFor(category);
  // Appointments and consultations are for a person; a delivery is not.
  const isClientWork = category === "appointment" || category === "consultation";

  // Close on Escape, and put focus somewhere sensible when it opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("input, select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <div
      /*
        * A sheet on a phone, a dialog on a desktop.
        *
        * Centred with padding, this floated in the middle of a small screen
        * with its buttons somewhere under the keyboard, and 88vh is taller
        * than a phone actually shows — vh ignores the browser chrome, so the
        * bottom of the box, which is where Save is, sat below the fold with no
        * way to reach it. Somebody adding a booking between clients could fill
        * the form in and not be able to finish it.
        *
        * Anchored to the bottom it opens where the thumb already is, and dvh
        * measures what the screen is really showing.
        */
      className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={existing ? "Edit diary entry" : "Add to the diary"}
        onClick={(e) => e.stopPropagation()}
        className="card max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6 sm:pb-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="section-title">
            {existing ? "Edit" : "Add to the diary"}
          </h2>
          <button type="button" onClick={onClose} className="hint hover:text-foreground">
            Close
          </button>
        </div>

        {fromClient ? (
          // A client booking is owned by its conversation. Time can move; the
          // rest belongs to the enquiry and is shown, not edited.
          <div className="mt-4 space-y-1 rounded-lg bg-surface-2/50 p-4 text-sm">
            <div className="font-medium">{entry?.clientName ?? "Client booking"}</div>
            {entry?.description && <div className="hint">{entry.description}</div>}
            {entry?.clientPhone && <div className="hint tabular-nums">{entry.clientPhone}</div>}
            <div className="hint">
              Deposit {formatPence(entry?.deposit_amount_pence ?? 0)} —{" "}
              {entry?.deposit_status === "paid" ? "paid" : "not paid"}
            </div>
            {entry?.conversationId && (
              <Link
                href={`/conversations/${entry.conversationId}`}
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                Open the conversation →
              </Link>
            )}
          </div>
        ) : null}

        <form action={action} className="mt-5 space-y-5">
          {entry && <input type="hidden" name="id" value={entry.id} />}
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="all_day" value={allDay ? "true" : "false"} />

          {!fromClient && (
            <Field label="What is it">
              <div className="flex flex-wrap gap-1.5">
                {(existing ? CATEGORIES : OWNER_CATEGORIES).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      category === c.key
                        ? "text-white"
                        : "border border-border text-muted hover:text-foreground"
                    }`}
                    style={category === c.key ? { background: c.hue } : undefined}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {chosen.hint && <p className="hint mt-2">{chosen.hint}</p>}
              {!chosen.blocks && (
                <p className="hint mt-1 text-warn">
                  A note only — the assistant can still book over this time.
                </p>
              )}
            </Field>
          )}

          {/*
           * Client work is for somebody; everything else is a title.
           *
           * A booking taken over the phone used to be a bare string, so that
           * person never reached the client list and had no history, no notes
           * and no alert. Now it builds the same record an assistant booking
           * does — which is the whole reason the client list is worth having.
           */}
          {!fromClient && isClientWork && (
            <Field
              label="Who it's for"
              hint="Search your clients, or type a name to add them."
            >
              <ClientPicker
                defaultValue={
                  entry ? { id: entry.contactId, name: entry.clientName } : null
                }
              />
            </Field>
          )}

          {/*
           * What it comes to.
           *
           * Only on client work — a dentist appointment in your own diary has
           * no price, and asking for one on every entry would be daft. Blank
           * stays blank rather than becoming zero.
           */}
          {!fromClient && isClientWork && (
            <Field label="Price" hint="What the job comes to. Leave blank if you don't know yet.">
              <div className="relative max-w-[10rem]">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                  £
                </span>
                <input
                  name="price"
                  inputMode="decimal"
                  defaultValue={
                    entry?.price_pence != null ? (entry.price_pence / 100).toString() : ""
                  }
                  placeholder="65"
                  className="input pl-7 tabular-nums"
                />
              </div>
            </Field>
          )}

          {!fromClient && !isClientWork && (
            <Field label="Title">
              <input
                name="title"
                defaultValue={entry?.title ?? ""}
                placeholder={
                  category === "supplies"
                    ? "Order ink and needles"
                    : category === "meeting"
                      ? "Accountant"
                      : "Dentist"
                }
                className="input"
                required
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="accent-[var(--accent)]"
              disabled={fromClient}
            />
            All day
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date">
              <input
                type="date"
                name="date"
                defaultValue={startFields.date}
                className="input"
                required
              />
            </Field>
            {!allDay && (
              <>
                <Field label="Start">
                  <input
                    type="time"
                    name="start_time"
                    defaultValue={startFields.time}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Minutes">
                  <input
                    type="number"
                    name="minutes"
                    min={5}
                    max={1440}
                    step={5}
                    defaultValue={minutes}
                    className="input"
                    required
                  />
                </Field>
              </>
            )}
            {allDay && (
              <Field label="Days">
                <input
                  type="number"
                  name="days"
                  min={1}
                  max={90}
                  defaultValue={Math.max(
                    1,
                    entry
                      ? Math.round(
                          (Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) /
                            86400000,
                        )
                      : 1,
                  )}
                  className="input"
                />
              </Field>
            )}
          </div>

          <Field label={artists.length > 1 ? "Who for" : "Diary"}>
            <select
              name="artist_id"
              defaultValue={entry?.artist_id ?? prefill?.artistId ?? artists[0]?.id}
              className="input"
              required
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          {!existing && !fromClient && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Repeat">
                <select
                  name="repeats"
                  value={repeats}
                  onChange={(e) => setRepeats(e.target.value)}
                  className="input"
                >
                  {REPEATS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              {repeats !== "none" && (
                <Field label="Until" hint="Leave blank for the next six months.">
                  <input type="date" name="repeat_until" className="input" />
                </Field>
              )}
            </div>
          )}

          {existing && entry?.repeats && entry.repeats !== "none" && (
            <p className="hint">
              Part of a repeating set. Saving changes this one only.
            </p>
          )}

          <Field label="Notes" hint="Only you see these.">
            <textarea name="notes" defaultValue={entry?.notes ?? ""} rows={2} className="input" />
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <SubmitButton>{existing ? "Save" : "Add it"}</SubmitButton>
            {state.error && <p className="text-sm text-bad">{state.error}</p>}
            <div className="flex-1" />
            {existing && entry?.repeats && entry.repeats !== "none" && (
              <button
                type="submit"
                formAction={cancelSeries}
                formNoValidate
                className="btn-danger"
              >
                Delete all future
              </button>
            )}
            {existing && (
              <button
                type="submit"
                formAction={cancelDiaryEntry}
                formNoValidate
                className="btn-danger"
              >
                {fromClient ? "Cancel booking" : "Delete this one"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
