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
}: {
  services: Bookable[];
  /** Whose column this is going in, so only their own extras are offered. */
  artistId: string | null;
  /** The client, when one has been chosen. Null for a walk-in. */
  contactId: string | null;
  onPick: (minutes: number, pricePence: number | null, name: string) => void;
}) {
  const [chosen, setChosen] = useState<string>("");

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

  return (
    <div>
      <label className="label" htmlFor="service-pick">
        What are they having
      </label>
      <select
        id="service-pick"
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
        className="input"
      >
        <option value="">Choose, or fill the length in yourself</option>
        {offerable.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.minutes} min
            {s.price_pence != null ? ` · ${formatPence(s.price_pence)}` : ""}
          </option>
        ))}
      </select>

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
