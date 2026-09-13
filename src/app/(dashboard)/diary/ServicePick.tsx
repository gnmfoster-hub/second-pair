"use client";

import { useEffect, useState } from "react";
import { clientTiming } from "./actions";
import { formatPence } from "@/lib/money";

export type Bookable = {
  id: string;
  name: string;
  minutes: number;
  price_pence: number | null;
  artist_id: string | null;
};

/**
 * Pick the thing, and the length and the price fill themselves in.
 *
 * The manual form has always asked for a number of minutes, so somebody adding
 * a colour had to remember how long a colour takes — which the business has
 * already written down. Getting it wrong is not an error, it is a diary that
 * runs late, and nobody ever traces it back to the box they typed 60 into.
 *
 * And this is where a client's own timing finally does something. It has been
 * recorded against them since it was built and only the assistant could read
 * it, so anybody booking by hand — which is most bookings in most salons — set
 * aside the standard time regardless.
 */
export function ServicePick({
  services,
  artistId,
  contactId,
  onPick,
  pick,
}: {
  services: Bookable[];
  /** Whose column this is going in, so only their own extras are offered. */
  artistId: string | null;
  /** The client, when one has been chosen. Null for a walk-in. */
  contactId: string | null;
  onPick: (minutes: number, pricePence: number | null, name: string) => void;
  /**
   * A service chosen elsewhere — "the usual", off the client's history.
   *
   * Taken as a value rather than a callback so tapping it twice still lands:
   * the summary sets it, this follows, and both stay in step.
   */
  pick?: string | null;
}) {
  const [chosen, setChosen] = useState<string>("");

  /** Narrowing a long price list. Only shown once there is a long one. */
  const [find, setFind] = useState("");

  /*
   * Following what was picked outside, tracked rather than watched.
   *
   * Adjusted during render the way React says to derive state from a prop —
   * an effect would set it after painting, so the length would show the old
   * service for a frame after somebody taps the usual.
   */
  const [lastPick, setLastPick] = useState(pick ?? null);
  if (pick !== lastPick) {
    setLastPick(pick ?? null);
    if (pick) setChosen(pick);
  }

  /*
   * What was found, and what it was found for.
   *
   * Kept together so a stale answer cannot be shown against a new pair. The
   * alternative — clearing it the moment either changes — means setting state
   * synchronously inside an effect, which runs after paint and shows last
   * client's twenty minutes against this one for a frame.
   */
  const [found, setFound] = useState<{
    key: string;
    timing: { minutes_delta: number; note: string | null } | null;
  } | null>(null);

  /*
   * The shop's list, plus anything belonging to the person whose column this
   * is. A nail technician's colours have no business on a stylist's booking.
   */
  const offerable = services.filter(
    (s) => s.artist_id == null || s.artist_id === artistId,
  );

  /*
   * What this client takes over this particular thing.
   *
   * Looked up when both are known, and only then. Asked for on every keystroke
   * it would be a request per render; asked for once per pair it is one round
   * trip at the moment somebody is reading the form anyway.
   */
  const pair = `${chosen}|${contactId ?? ""}`;
  const timing = found?.key === pair ? found.timing : null;

  useEffect(() => {
    if (!chosen || !contactId) return;

    let cancelled = false;
    (async () => {
      const answer = await clientTiming(contactId, chosen);
      if (!cancelled) setFound({ key: `${chosen}|${contactId}`, timing: answer });
    })();

    return () => {
      cancelled = true;
    };
  }, [chosen, contactId]);

  // Telling the parent what it works out to, whenever either part changes.
  useEffect(() => {
    const service = offerable.find((s) => s.id === chosen);
    if (!service) return;
    const minutes = Math.max(5, service.minutes + (timing?.minutes_delta ?? 0));
    onPick(minutes, service.price_pence, service.name);
    // onPick is recreated each render by the parent; depending on it would
    // loop. What matters is the service and the timing, and those are here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, timing]);

  if (offerable.length === 0) return null;

  const service = offerable.find((s) => s.id === chosen);

  const needle = find.trim().toLowerCase();
  const shown = needle
    ? offerable.filter((s) => s.name.toLowerCase().includes(needle))
    : offerable;

  /*
   * The shop's list and this person's own, kept apart.
   *
   * Run together, a stylist's own colour sits between two of the shop's with
   * nothing to say which is which, and "why is that one a different price"
   * becomes a question the screen cannot answer.
   */
  const shopList = shown.filter((s) => s.artist_id == null);
  const ownList = shown.filter((s) => s.artist_id != null);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label">What are they having</span>
        {chosen && (
          <button
            type="button"
            onClick={() => setChosen("")}
            className="text-xs text-muted underline hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/*
        * A search box only once the list is long enough to need one.
        *
        * Under a dozen, scanning beats typing and a search box is one more
        * thing in the way. Over it, a salon's full price list is thirty lines
        * and hunting for "root touch-up" by eye on a phone is the slow part of
        * taking a booking.
        */}
      {offerable.length > 12 && (
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find a service"
          className="input mt-1.5"
          autoComplete="off"
        />
      )}

      {/*
        * Tappable rows rather than a dropdown.
        *
        * This was a native select with everything crushed onto one line —
        * "Cut and blow dry — 45 min · £42.00" — which on a phone opens as a
        * spinning wheel of truncated strings and on a desktop is a list
        * nobody can scan, because the name, the length and the price run
        * together in one weight.
        *
        * They are three different questions, so they get three places on the
        * row: what it is on the left, how long and how much on the right,
        * lined up so the eye can run down either column. Which is what a price
        * list on a wall looks like, and this is the same information.
        */}
      <div className="mt-1.5 max-h-72 space-y-1 overflow-y-auto pr-0.5">
        {shown.length === 0 && (
          <p className="hint px-1 py-2">Nothing matches &ldquo;{find}&rdquo;.</p>
        )}

        {shopList.map((s) => (
          <ServiceRow
            key={s.id}
            service={s}
            chosen={chosen === s.id}
            onChoose={() => setChosen(s.id)}
          />
        ))}

        {ownList.length > 0 && (
          <>
            <div className="px-1 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Theirs alone
            </div>
            {ownList.map((s) => (
              <ServiceRow
                key={s.id}
                service={s}
                chosen={chosen === s.id}
                onChoose={() => setChosen(s.id)}
              />
            ))}
          </>
        )}
      </div>

      <p className="hint mt-1.5">Or leave it, and fill the length in yourself.</p>

      {/*
       * Why the number moved, in the words of whoever wrote it down.
       *
       * Without this the form looks like it is guessing. With it, it is
       * obviously repeating something a colleague recorded — which is the
       * difference between trusting the number and typing over it.
       */}
      {service && timing && timing.minutes_delta !== 0 && (
        <p className="hint mt-2 rounded-lg bg-surface-2 px-3 py-2">
          <strong className="text-foreground">
            {timing.minutes_delta > 0
              ? `${timing.minutes_delta} minutes longer than usual`
              : `${-timing.minutes_delta} minutes shorter than usual`}
          </strong>{" "}
          for this client
          {timing.note ? ` — ${timing.note}` : ""}. Set aside{" "}
          {Math.max(5, service.minutes + timing.minutes_delta)} minutes.
        </p>
      )}
    </div>
  );
}

/**
 * One thing the business sells, as a row you can hit with a thumb.
 *
 * Name on the left, length and price on the right in figures that line up
 * down the column. Forty-four pixels tall, because this is tapped standing up
 * with a client waiting.
 */
function ServiceRow({
  service,
  chosen,
  onChoose,
}: {
  service: Bookable;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={chosen}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        chosen
          ? "border-accent bg-accent/10"
          : "border-border bg-surface-2/30 hover:border-accent/40"
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{service.name}</span>

      <span className="shrink-0 text-right text-xs tabular-nums text-muted">
        {service.minutes} min
      </span>

      {/*
        * Fixed width, so the prices line up even where one is £8 and the next
        * is £120. A column of money that does not line up reads as a list of
        * unrelated numbers.
        */}
      <span className="w-16 shrink-0 text-right text-sm tabular-nums">
        {service.price_pence != null ? formatPence(service.price_pence) : "—"}
      </span>
    </button>
  );
}
