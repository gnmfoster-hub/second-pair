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
  onChosen,
  name = "contact_name",
  idName = "contact_id",
  placeholder = "Search, or type a new name",
}: {
  defaultValue?: { id: string | null; name: string | null } | null;
  /**
   * What the two hidden fields are called.
   *
   * Defaulted to the names the diary form has always used, so that one is
   * untouched. The group form needs a picker per row and cannot have five
   * fields all called contact_name.
   */
  name?: string;
  idName?: string;
  placeholder?: string;
  /**
   * Told when somebody is picked, so the form can look up what this client
   * takes over the thing they are having. The hidden fields below stay the
   * record of truth for the submit; this is only for what the form shows.
   */
  onChosen?: (id: string | null) => void;
}) {
  const [query, setQuery] = useState(defaultValue?.name ?? "");
  const [chosen, setChosenState] = useState<ClientChoice | null>(
    defaultValue?.name ? { id: defaultValue.id, name: defaultValue.name } : null,
  );
  const setChosen = (next: ClientChoice | null) => {
    setChosenState(next);
    onChosen?.(next?.id ?? null);
  };

  /*
   * How to reach somebody being added for the first time.
   *
   * The picker took a name and nothing else, so every client booked in over
   * the phone arrived with no number on them — and the product that exists to
   * send reminders and offer cancelled slots could reach not one of them. The
   * number is in the hand of whoever is typing the name; asking a week later
   * means asking the customer again.
   *
   * Both optional, and only shown for somebody new: an existing client already
   * has whatever is on their record, and offering to change it here is how a
   * booking quietly overwrites a phone number.
   */
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  /*
   * Which they would rather have, asked only once both are on offer.
   *
   * With one address there is nothing to choose between, and a question with
   * one answer is a question worth not asking.
   */
  const [prefers, setPrefers] = useState("");

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
      <input type="hidden" name={idName} value={chosen?.id ?? ""} />
      <input type="hidden" name={name} value={chosen?.name ?? ""} />
      {/* Only for somebody new. An existing client's details are theirs and
          are changed on their record, not in passing while booking them. */}
      <input type="hidden" name={`${name}_phone`} value={chosen && !chosen.id ? phone : ""} />
      <input type="hidden" name={`${name}_email`} value={chosen && !chosen.id ? email : ""} />
      <input
        type="hidden"
        name={`${name}_prefers`}
        value={chosen && !chosen.id && phone.trim() && email.trim() ? prefers : ""}
      />

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setChosen(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
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

      {/*
        * And how to reach them, while somebody is standing there.
        *
        * Two boxes rather than a second screen, because the number is in the
        * hand of whoever is typing the name and will not be later. Either or
        * neither: plenty of people book with a name and nothing else, and a
        * required field here would be a required lie.
        */}
      {chosen && !chosen.id && (
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="min-w-[9rem] flex-1">
            <span className="label">Mobile</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="off"
              placeholder="07700 900123"
              className="input num"
            />
          </label>
          <label className="min-w-[11rem] flex-1">
            <span className="label">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="off"
              placeholder="them@example.com"
              className="input"
            />
          </label>
          {/*
            * And which they would rather have, once there are two.
            *
            * Only then: with one address there is nothing to choose between,
            * and a question with one answer is one worth not asking. It
            * reorders what gets tried and takes nothing away — somebody who
            * prefers email is still textable when the chair falls free at
            * nine in the morning.
            */}
          {phone.trim() && email.trim() && (
            <div className="w-full">
              <span className="label">Best on</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[
                  { value: "", label: "No preference" },
                  { value: "sms", label: "Text" },
                  { value: "email", label: "Email" },
                ].map((option) => (
                  <button
                    key={option.value || "any"}
                    type="button"
                    onClick={() => setPrefers(option.value)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      prefers === option.value
                        ? "bg-accent text-on-accent"
                        : "border border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="hint w-full">
            Either, both or neither. Without one of them a reminder has nowhere to go and
            a cancelled slot cannot be offered to them.
          </p>
        </div>
      )}

      {/*
        * In the flow of the form, not floating over it.
        *
        * This was an absolutely positioned dropdown, which is the ordinary way
        * to build one and is the wrong way here. The form it sits in is a
        * sheet with `overflow-y-auto`, and a scroll container clips whatever
        * is absolutely positioned inside it — so on a phone, where the client
        * search sits halfway down a sheet that is already full, the matches
        * were cut off at the edge of the box with no way to scroll to them.
        * The one control you need in order to book somebody who has been
        * before, unreachable on the device the diary is mostly used on.
        *
        * Taking up room instead means the sheet grows and scrolls the way
        * everything else in it does. It pushes the fields below down while it
        * is open, which is a much smaller price than a list you cannot read.
        * Its own scroll caps it, so eight matches cannot shove Save off the
        * bottom.
        */}
      {open && query.trim().length >= 2 && (
        <div className="mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-[var(--shadow-pop)]">
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
