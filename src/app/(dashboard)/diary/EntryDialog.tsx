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
  type DiaryState,
} from "./actions";
import { Field, SubmitButton } from "@/components/Form";
import { useSheet, asSheet } from "@/components/useSheet";
import { formatPence } from "@/lib/money";
import { depositPaid, hasDeposit } from "@/lib/deposit";
import { Complete } from "./Complete";
import type { ShelfItem } from "./Complete";
import { CATEGORIES, OWNER_CATEGORIES, categoryFor, REPEATS } from "@/lib/calendar";
import type { Artist } from "@/lib/types";
import type { Entry } from "./WeekGrid";

/** The last millisecond of today, in this browser's own day. */
function endOfToday(): number {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

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
  shelf = [],
  payable = [],
  travels = false,
  adding,
  onClose,
}: {
  entry: Entry | null;
  prefill: { date: string; time: string; endTime?: string; artistId?: string } | null;
  artists: Artist[];
  timezone: string;
  /** What the business sells, where it keeps a named list. */
  services?: Bookable[];
  /**
   * The things on the shelf, as opposed to the work.
   *
   * Separate from `services` above on purpose: that one is what can be booked,
   * and this is what can be sold alongside it. Empty for a business that does
   * not sell anything over the counter, and the panel then never appears.
   */
  shelf?: ShelfItem[];
  /** Whose appointments can be paid by card link: the people with somewhere for the money to land. */
  payable?: string[];
  /**
   * Whether the work happens at the customer's address.
   *
   * Only changes what closing a booking off is called. "They came" is right
   * for a salon and wrong for a cleaner, who went to them — and a screen that
   * describes the job backwards is one somebody stops reading.
   */
  travels?: boolean;
  /** What the add menu said this is, when it was asked. */
  adding?: "client" | "walkin" | "other";
  onClose: () => void;
}) {
  const [state, action] = useActionState<DiaryState, FormData>(saveDiaryEntry, {});
  /*
   * The sheet itself: focus goes in here when it opens, and useSheet holds
   * the page still behind it and measures what the keyboard has left.
   */
  const dialog = useSheet<HTMLDivElement>();

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
   *
   * And when nothing said — which is every tap and drag straight onto the
   * grid, the commonest way anybody adds anything — it is an appointment too.
   * It used to fall through to "personal", so clicking an empty eleven o'clock
   * gave you a time-off form: no client picker, no service list, no history,
   * no price. Every one of those is hidden behind `isClientWork`, so the whole
   * booking half of this form was missing from the route most people take to
   * it, and it looked like the client history had simply stopped working.
   *
   * A slot in a diary is an appointment unless somebody says otherwise. Time
   * off is the deliberate choice, and it is one tap away in the same control.
   */
  const [category, setCategory] = useState(
    entry?.category ?? (adding === "other" ? "personal" : "appointment"),
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

  /*
   * What can be sold at this particular appointment.
   *
   * The shop's shelf, plus anything belonging to whoever is doing the work.
   * Somebody else's own products are theirs to sell and not on this list —
   * putting them here would put the money in the wrong person's takings on a
   * business that pays each person directly, which is the one mistake in this
   * area nobody would ever spot.
   */
  const mineToSell = entry
    ? shelf.filter((s) => s.ownerId == null || s.ownerId === entry.artist_id)
    : [];

  // Close on Escape, and put focus somewhere sensible when it opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("input, select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
    // `dialog` comes from a hook rather than useRef, so the linter cannot see
    // that it is stable. It is — listing it costs nothing and keeps the rule on.
  }, [onClose, dialog]);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return asSheet(
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
         *
         * And whichever of those two is smaller, once the keyboard is up.
         * --sheet-room is the screen that is actually left, measured by
         * useSheet — dvh is the window, and on iOS a keyboard covers the
         * window rather than changing it, so 82dvh put Save underneath it.
         * The fallback is the old behaviour for anything with no
         * visualViewport to ask.
         */
        /*
         * overscroll-contain keeps the gesture in here. Without it, reaching
         * the end of this box hands the rest of the flick to the diary
         * underneath, which then scrolls instead — half of "the diary behind
         * scrolls, not the box". The other half is the page being held still,
         * which useSheet does.
         */
        className="card sheet-roomy max-h-[min(82dvh,var(--sheet-room,82dvh))] w-full max-w-lg overflow-y-auto overscroll-contain rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[min(88dvh,var(--sheet-room,88dvh))] sm:rounded-2xl sm:p-6 sm:pb-6"
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
              {/*
                * Who to ring if the whole thing has to move — you ring the
                * bride, not the four bridesmaids. Recorded since groups were
                * built and read nowhere until now.
                */}
              {entry.group.organiser && (
                <> {entry.group.organiser} arranged it.</>
              )}
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
          </div>
        ) : null}


        {/* space-y-4 on a phone. Five was a fifth of the screen given to the
            gaps between fields on a form that already had to scroll. */}
        <form action={action} className="sheet-fields mt-4 space-y-4 sm:mt-5 sm:space-y-5">
          {entry && <input type="hidden" name="id" value={entry.id} />}
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="all_day" value={allDay ? "true" : "false"} />


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

          {/*
            * Everything usually left alone, folded.
            *
            * Whether it repeats, what kind of entry it is, and a note nobody
            * else sees. Five more fields on a sheet whose common case is a
            * name, a service and a time — and every one of them visible meant
            * scrolling past four things to reach the one you wanted, on a
            * phone, with somebody on the line.
            *
            * A summary rather than a heading, so it is one tap when it is
            * wanted and no height when it is not. Open on an entry already
            * using any of it, because then it is not "anything else", it is
            * what this booking is.
            */}
          <details
            className="sheet-wide rounded-xl border border-border px-3.5 py-2.5"
            open={Boolean(
              entry?.notes || (entry?.repeats && entry.repeats !== "none") || !isClientWork,
            )}
          >
            <summary className="cursor-pointer text-sm text-muted">Anything else</summary>
            <div className="mt-3 space-y-4">
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
          {/*
            * What kind of entry this is, below the booking rather than above
            * it.
            *
            * It was the first question on the sheet: a row of chips asking
            * "what is it" before anything about who or when. Nineteen times
            * in twenty the answer is "an appointment" — it is what the slot
            * you just tapped is for — and the add menu has usually said so
            * already. Asking first put the rarest decision in front of the
            * commonest one, on a form somebody is filling in with a customer
            * waiting on the phone.
            *
            * Still here, still one tap, just not in the way. Open when it is
            * anything other than ordinary client work, because that is when
            * it is the thing being changed.
            */}
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


          <Field label="Notes" hint="Only you see these.">
            <textarea name="notes" defaultValue={entry?.notes ?? ""} rows={2} className="input" />
          </Field>
            </div>
          </details>

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

          {/*
            * Money already taken, said before somebody cancels rather than
            * discovered afterwards.
            *
            * Cancelling frees the slot and leaves the deposit exactly where it
            * is, which is right — whether to keep it or give it back is the
            * business's decision and often their written policy. What was
            * wrong is that nothing said so. Somebody cancels an appointment
            * with twenty-five pounds against it, the screen says nothing about
            * money, and the question surfaces weeks later when the customer
            * asks where their deposit went.
            *
            * No button. The money is on their own Stripe account and they are
            * the merchant of record; the exact charge is a link on the
            * client's record, which is where somebody goes to give it back.
            */}
          {existing && depositPaid(entry ?? {}) && hasDeposit(entry ?? {}) && (
            <p className="hint pt-1">
              {formatPence(entry?.deposit_amount_pence ?? 0)} has been paid on this.
              Cancelling does not return it &mdash; keeping it or refunding it is your
              call, in Stripe, from their record.
            </p>
          )}

          <div className="sheet-wide flex flex-wrap items-center gap-3 pt-1">
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

        {/*
          * Finishing off, under the detail rather than over it.
          *
          * These were the first thing on the screen, above the fields that say
          * when the appointment is and who it is with — which is the wrong way
          * round for every visit to this panel except the last one. You open an
          * appointment to read it or change it far more often than to close it
          * out, and on a phone a screenful of money controls stood between
          * somebody and the time they came to check.
          */}
        {/*
          * Everything you do to an appointment while somebody is standing
          * there: what it cost, charging for it, selling them something, and
          * closing it off afterwards.
          *
          * Outside the block above, which is the point. All of this used to
          * live inside it, and that block only renders when the booking came
          * from a conversation — so an appointment typed into the diary by
          * hand had no complete button, no payment link and no way to sell
          * anybody a bottle. Which is most appointments in most salons: the
          * phone rings, somebody writes it in, and none of the things this
          * product is for were reachable from it.
          *
          * Client work only. A lunch break and a day off are entries in the
          * diary and neither of them is owed money or needs closing off.
          */}
        {entry && isClientWork && (
          <div className="sheet-wide mt-4 space-y-1 rounded-lg bg-surface-2/50 p-4 text-sm">
            {/*
              * Named, because it was reported missing twice while being on the
              * screen.
              *
              * There is no button called "complete" and there should not be:
              * finishing with somebody is two facts — what they owe and
              * whether they turned up — and a single button would have to
              * guess at both. But a block of controls with no heading reads as
              * a row of unrelated options, and somebody looking for the end of
              * an appointment scrolls past it.
              */}
            <div className="label pb-1">Finishing off</div>
            {/*
              * Only where there is a deposit to speak of.
              *
              * This read "Deposit £0.00 — paid" on everything typed into the
              * diary by hand, because those are stored as nothing-marked-paid
              * to keep the unpaid-hold sweep from cancelling them. Most
              * entries in most diaries carry no deposit at all, so the
              * commonest thing this line did was make a false statement about
              * money — in a studio that had not even connected Stripe.
              */}
            {hasDeposit(entry) && (
              <div className="hint">
                Deposit {formatPence(entry.deposit_amount_pence ?? 0)} —{" "}
                {depositPaid(entry) ? "paid" : "not paid"}
              </div>
            )}

            {/*
              * Out to the two places this appointment came from.
              *
              * Their record is where a phone number, an email address, what
              * they are allergic to and what they have agreed to be sent all
              * live — and there has never been a way to reach it from the
              * appointment. Changing somebody's number meant closing this,
              * going to the client list, searching for a name you are looking
              * at, and opening them: four steps away from the screen that
              * already knows who they are.
              */}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {entry.contactId && (
                <Link
                  href={`/clients/${entry.contactId}`}
                  className="inline-block text-sm text-accent hover:underline"
                >
                  Open their record →
                </Link>
              )}

              {entry.conversationId && (
                <Link
                  href={`/conversations/${entry.conversationId}`}
                  className="inline-block text-sm text-accent hover:underline"
                >
                  Open the conversation →
                </Link>
              )}
            </div>

            {/*
              * One button, and the whole of finishing behind it.
              *
              * Two panels stood here — a bill, and a "did they turn up" — each
              * saving on its own, so an appointment was finished only if
              * somebody knew to use both. Asked for again and again as "a
              * complete button". It is one now: did they come, what did they
              * have, anything bought, how did they pay, and the last tap does
              * all of it.
              *
              * From the morning of the day, not the minute it starts. Waiting
              * for the start time hid the button on everything later today,
              * which is exactly where somebody looks for it while the client
              * is still in the chair.
              */}
            {Date.parse(entry.starts_at) <= endOfToday() ? (
              <Complete
                bookingId={entry.id}
                clientName={entry.clientName}
                workName={entry.title || "Appointment"}
                workPence={entry.price_pence ?? entry.quotePence}
                services={services}
                shelf={mineToSell}
                connected={Boolean(entry.artist_id && payable.includes(entry.artist_id))}
                attended={entry.attended}
                travels={travels}
                alreadyPence={entry.soldPence}
                bookedMinutes={Math.round(
                  (Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) / 60000,
                )}
              />
            ) : (
              <p className="hint">
                You can complete this on the day.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
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
