"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ClientPicker } from "./ClientPicker";
import { ServicePick, type Bookable } from "./ServicePick";
import { ClientSummary } from "./ClientSummary";
import Link from "next/link";
import { cancelBookingGroup, type GroupState } from "./groupActions";
import {
  saveDiaryEntry,
  cancelDiaryEntry,
  cancelSeries,
  closeBooking,
  type DiaryState,
} from "./actions";
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
  services = [],
  adding,
  onClose,
}: {
  entry: Entry | null;
  prefill: { date: string; time: string; endTime?: string; artistId?: string } | null;
  artists: Artist[];
  timezone: string;
  /** What the business sells, where it keeps a named list. */
  services?: Bookable[];
  /** What the add menu said this is, when it was asked. */
  adding?: "client" | "walkin" | "other";
  onClose: () => void;
}) {
  const [state, action] = useActionState<DiaryState, FormData>(saveDiaryEntry, {});
  const dialog = useRef<HTMLDivElement>(null);

  const existing = Boolean(entry);
  const fromClient = entry?.source === "assistant";

  /*
   * The clock, read once when the sheet opens.
   *
   * Only used to decide whether an appointment has finished, so a value from
   * the moment it was opened is the right one — and reading it in the body of
   * a render would give a different answer on every re-render for something
   * that should not change while somebody is looking at it.
   */
  const [openedAt] = useState(() => Date.now());

  /*
   * The length, and who it is for, held here rather than left to the inputs.
   *
   * Picking a service has to be able to fill the length in, and looking up
   * what this client takes needs to know which client — neither of which the
   * form can do while both live only in uncontrolled fields.
   */
  const [contactId, setContactId] = useState<string | null>(entry?.contactId ?? null);

  /** What "the usual" put in the service box, relayed from their history. */
  const [usual, setUsual] = useState<string | null>(null);
  const [whoseColumn, setWhoseColumn] = useState<string>(
    entry?.artist_id ?? prefill?.artistId ?? artists[0]?.id ?? "",
  );

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

  /*
   * How long it runs, once something can change it.
   *
   * Picking a service sets it, and a client who takes longer than the book
   * says moves it again — so it cannot live in an uncontrolled field the way
   * it did when the only way to fill it in was to type.
   */
  const [length, setLength] = useState(minutes);

  /*
   * And the price, for the same reason: picking a service knows what it comes
   * to, and the week's takings are read off this field.
   */
  const [price, setPrice] = useState(
    entry?.price_pence != null ? (entry.price_pence / 100).toString() : "",
  );

  /*
   * What the add menu said this is.
   *
   * "Time off or something that is not a client" opens on a block; everything
   * else opens on an appointment. Without this the menu asks a question and
   * then ignores the answer, which is worse than not asking.
   */
  const [category, setCategory] = useState(
    entry?.category ?? (adding === "other" ? "personal" : adding ? "appointment" : "personal"),
  );

  /*
   * The title, filled in by the category unless somebody has typed.
   *
   * Choosing "Holiday" and then typing the word Holiday is the machine asking
   * you to repeat yourself, and it is most of what gets typed into this box —
   * holiday, lunch, training, admin. The category already says it.
   *
   * Only ever overwrites what it wrote itself. Kept in a ref rather than
   * compared against the label list, because somebody who types "Holiday" on
   * purpose and then changes the category to Training should keep their word:
   * the question is not whether the text matches a label, it is whether we are
   * the ones who put it there.
   */
  const [title, setTitle] = useState(entry?.title ?? "");
  const filledIn = useRef(entry ? null : "");

  const chooseCategory = (key: string) => {
    setCategory(key);

    const label = categoryFor(key).label;
    if (title === filledIn.current) {
      setTitle(label);
      filledIn.current = label;
    }
  };
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
        /*
         * 82dvh, not 88.
         *
         * Tapping the dark outside has always closed this, but at 88dvh the
         * outside is a twelve percent strip along the very top of the screen —
         * the furthest point from a thumb and easy to miss, so the way out was
         * technically there and practically was not. Six percent more backdrop
         * is about fifty pixels of target across the full width of the phone,
         * at the end the hand is already at.
         */
        className="card max-h-[82dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[88dvh] sm:rounded-2xl sm:p-6 sm:pb-6"
      >
        {/* The bar every phone sheet has, which says this one lifts off rather
            than being a page you have to finish. */}
        <div
          aria-hidden
          className="mx-auto mb-3 h-1 w-9 rounded-full bg-border sm:hidden"
        />

        <div className="flex items-start justify-between gap-3">
          <h2 className="section-title">
            {existing ? "Edit" : "Add to the diary"}
          </h2>
          {/*
            * A real target, not the word "Close" set in hint.
            *
            * That was twelve-pixel muted text about thirty pixels wide in the
            * corner of a form that fills the screen — the smallest thing in
            * the dialog doing the job people need most often, and the reason
            * getting out of here was hard. Forty-four square is the size a
            * thumb actually hits.
            */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1.5 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6.5 6.5l11 11M17.5 6.5l-11 11"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/*
          * What else this is part of.
          *
          * Above the booking's own detail because it changes how the rest is
          * read: a 45-minute blow dry at half nine means something different
          * when it is one of five for the same wedding, and the thing somebody
          * wants at that moment is usually the other four rather than this one.
          *
          * Shown for any source, since an arrangement can hold both a booking
          * the assistant made and one typed in afterwards.
          */}
        {entry?.group && (
          <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
            <div className="font-medium">{entry.group.name}</div>
            <div className="hint mt-0.5">
              One of {entry.group.size} booked together
              {entry.group.size > 1 ? " on this day" : ""}.
            </div>
            <GroupControls id={entry.group.id} name={entry.group.name} />
          </div>
        )}

        {fromClient ? (
          // A client booking is owned by its conversation. Time can move; the
          // rest belongs to the enquiry and is shown, not edited.
          <div className="mt-4 space-y-1 rounded-lg bg-surface-2/50 p-4 text-sm">
            <div className="font-medium">{entry?.clientName ?? "Client booking"}</div>
            {entry?.description && <div className="hint">{entry.description}</div>}
            {entry?.clientPhone && <div className="hint tabular-nums">{entry.clientPhone}</div>}

            {/*
              * Where the job is, for the person driving to it.
              *
              * Deliberately here and not on the row: a day's list is read at a
              * glance and an address on every line makes it unreadable. This
              * is what somebody needs once they have opened the one they are
              * about to set off for — which is the moment they are standing by
              * a van with a phone in their hand.
              *
              * A map link rather than an address to copy out, because that is
              * what happens to it next either way.
              */}
            {(entry?.job_address || entry?.job_postcode) && (
              <div className="mt-1.5">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [entry.job_address, entry.job_postcode].filter(Boolean).join(", "),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {[entry.job_address, entry.job_postcode].filter(Boolean).join(", ")}
                </a>
              </div>
            )}
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

            {/*
              * Only once it has actually finished.
              *
              * Asking whether somebody turned up to Thursday's appointment on
              * Tuesday is noise on every booking in the diary, and noise on
              * every booking is how a control gets ignored on the one that
              * matters.
              */}
            {entry && Date.parse(entry.ends_at) < openedAt && (
              <CloseOff
                id={entry.id}
                attended={entry.attended}
                booked={Math.round(
                  (Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) / 60000,
                )}
                actualMinutes={entry.actual_minutes}
                note={entry.outcome_note}
              />
            )}
          </div>
        ) : null}

        {/* space-y-4 on a phone. Five was a fifth of the screen given to the
            gaps between fields on a form that already had to scroll. */}
        <form action={action} className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
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
                    onClick={() => chooseCategory(c.key)}
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
                onChosen={setContactId}
                defaultValue={
                  entry ? { id: entry.contactId, name: entry.clientName } : null
                }
              />
            </Field>
          )}

          {/*
           * What they are having, which fills in the length and the price.
           *
           * Straight after who it is for, and that order is the point: a
           * client's own timing cannot be applied until the form knows which
           * client. Only where the business keeps a named list — a business
           * pricing by size and hours never sees this and nothing changes for
           * them.
           */}
          {/*
            * Who they are, once they have been picked.
            *
            * Above the service, because what they usually have is the fastest
            * way to fill it in and the history is what somebody on the phone
            * is about to mention.
            */}
          {!fromClient && isClientWork && (
            <ClientSummary contactId={contactId} onUsual={setUsual} />
          )}

          {!fromClient && isClientWork && services.length > 0 && (
            <ServicePick
              services={services}
              artistId={whoseColumn}
              contactId={contactId}
              pick={usual}
              onPick={(mins, pence) => {
                setLength(mins);
                if (pence != null) setPrice((pence / 100).toFixed(2));
              }}
            />
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
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                /*
                  * Selected on focus when we are the ones who filled it in, so
                  * the first keystroke replaces it rather than landing in the
                  * middle of a word they did not type. Somebody adding to it
                  * just presses right first, which is what selected text is
                  * for.
                  */
                onFocus={(e) => {
                  if (title && title === filledIn.current) e.target.select();
                }}
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
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value) || 0)}
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
              onChange={(e) => setWhoseColumn(e.target.value)}
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

          {/*
            * The way out for somebody who has five of these to type.
            *
            * Here rather than on the Add button, because this is the moment it
            * occurs to them: the form is open, the first name is half typed,
            * and they have just remembered it is a wedding. A menu on the
            * button would put the choice before the realisation.
            */}
          {!existing && (
            <p className="hint pt-1">
              Several people in together?{" "}
              <Link href="/diary/group" className="text-accent hover:underline">
                Book them as a group
              </Link>{" "}
              &mdash; each gets their own appointment, tied together so they can be
              called off as one.
            </p>
          )}

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

/**
 * Did they turn up?
 *
 * Two buttons and a way back, rather than a form with a Save. Closing off a
 * booking happens with somebody's coat half on and the next client waiting; a
 * control that needs a second press to commit is one that gets abandoned
 * halfway, and a half-closed booking is indistinguishable from an unasked one.
 *
 * The answer already given is shown as the pressed state, so the panel says
 * what is recorded rather than asking a question that has been answered.
 */
function CloseOff({
  id,
  attended,
  booked,
  actualMinutes,
  note,
}: {
  id: string;
  attended: boolean | null;
  /** How many minutes it was booked for, so the box can say what it beat. */
  booked: number;
  actualMinutes: number | null;
  note: string | null;
}) {
  return (
    <form action={closeBooking} className="mt-3 border-t border-border pt-3">
      <input type="hidden" name="id" value={id} />
      <div className="label">How did it go?</div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          name="attended"
          value="yes"
          className={`btn-ghost text-sm ${
            attended === true ? "bg-ok/10 text-ok" : ""
          }`}
        >
          They came
        </button>
        <button
          name="attended"
          value="no"
          className={`btn-ghost text-sm ${
            attended === false ? "bg-warn/10 text-warn" : ""
          }`}
        >
          No-show
        </button>

        {/*
          * The way back from a mis-tap. Without it the only correction for
          * "no-show" pressed on the wrong appointment is to claim they turned
          * up, which puts a wrong number in the report rather than no number.
          */}
        {attended !== null && (
          <button name="attended" value="clear" className="text-sm text-muted hover:text-foreground">
            Neither, yet
          </button>
        )}
      </div>

      {attended === false && (
        <p className="hint mt-2">
          Counted on their record and in the report. Nothing happens to the deposit on
          its own &mdash; keeping it or returning it stays your call.
        </p>
      )}

      {/*
        * How long it really took, and what happened.
        *
        * Behind a summary, and only once somebody has said they came, because
        * it is the one number no diary ever records and the one nobody has
        * time to be asked for. Somebody closing a booking off at half past
        * five is answering "did they come"; made to answer "how long exactly"
        * as well, they stop answering either.
        *
        * So it is offered, never required, and the value comes from the times
        * somebody bothers. Every one of them makes the next estimate better.
        */}
      {attended === true && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">
            {actualMinutes != null || note ? "What happened" : "Add what it really took"}
          </summary>

          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="label">How long it actually took</span>
              <div className="flex items-center gap-2">
                <input
                  name="actual_minutes"
                  type="number"
                  min={5}
                  step={5}
                  defaultValue={actualMinutes ?? ""}
                  placeholder={String(booked)}
                  className="input max-w-[7rem]"
                />
                <span className="hint">
                  minutes. It was booked for {booked}.
                </span>
              </div>
            </label>

            <label className="block">
              <span className="label">Anything worth remembering</span>
              <input
                name="outcome_note"
                defaultValue={note ?? ""}
                placeholder="Ran over — colour needed a second application"
                className="input"
              />
              <span className="hint">
                For you and whoever has them next. Never shown to the client.
              </span>
            </label>

            <button name="attended" value="yes" className="btn-ghost text-sm">
              Save this
            </button>
          </div>
        </details>
      )}
    </form>
  );
}

/**
 * Calling the whole arrangement off.
 *
 * Behind a confirm, and the confirm says the number rather than the word
 * "group" — "cancel all 5" is a decision somebody can make in the half second
 * they have, where "cancel group" is a thing they have to stop and picture.
 *
 * Only cancelling. There is deliberately no "move them all", because the five
 * are in four different people's diaries at four different times and there is
 * no single sensible thing a nudge could mean. Each is dragged on its own, the
 * way any other booking is.
 */
function GroupControls({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState<GroupState, FormData>(cancelBookingGroup, {});
  const [asked, setAsked] = useState(false);

  if (state.ok) {
    return (
      <p className="mt-2 text-sm text-ok">
        {state.made} cancelled. The slots are free and the history stays.
      </p>
    );
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="group_id" value={id} />

      {asked ? (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-ghost text-sm text-warn">
            Yes, cancel all of {name}
          </button>
          <button
            type="button"
            onClick={() => setAsked(false)}
            className="text-sm text-muted hover:text-foreground"
          >
            Leave it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsked(true)}
          className="text-sm text-muted hover:text-warn"
        >
          Cancel the whole thing
        </button>
      )}

      {state.error && <p className="mt-2 text-sm text-warn">{state.error}</p>}
    </form>
  );
}
