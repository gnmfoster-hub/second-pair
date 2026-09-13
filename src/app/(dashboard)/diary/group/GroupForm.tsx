"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createBookingGroup, type GroupState } from "../groupActions";
import { ClientPicker } from "../ClientPicker";
import type { Artist } from "@/lib/types";

/** One person in the party, as the form holds them before it is submitted. */
type Row = { who: string; artistId: string; time: string; minutes: string; price: string };

/**
 * A wedding party, a family, a house of four rooms.
 *
 * Five people in on the same morning is five appointments and one arrangement.
 * The diary could already hold the five; what it could not hold is that they
 * belong together — so moving the bride moved nothing else, and calling the
 * whole thing off meant finding five rows by eye.
 *
 * A full page rather than a dialog, deliberately. This is the most tedious
 * typing in the product and it is usually done on a phone with somebody on the
 * other end of it; a dialog with five rows in it on a phone is a scroll trap
 * with a form inside.
 */
export function GroupForm({ artists, today }: { artists: Artist[]; today: string }) {
  const [state, action] = useActionState<GroupState, FormData>(createBookingGroup, {});

  /*
   * Three rows to begin with, because a party is almost never one person and
   * starting at one makes everybody press Add twice before they can type.
   */
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 3 }, () => ({
      who: "",
      artistId: artists[0]?.id ?? "",
      time: "10:00",
      minutes: "45",
      price: "",
    })),
  );

  const set = (i: number, patch: Partial<Row>) =>
    setRows((old) => old.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  /*
   * Each new row starts where the last one finished.
   *
   * A wedding party is booked back to back far more often than not, so
   * carrying the previous person's finish time forward is right nearly every
   * time and trivial to change when it is not.
   */
  function addRow() {
    setRows((old) => {
      const last = old[old.length - 1];
      let time = last?.time ?? "10:00";
      const mins = Number(last?.minutes);
      if (last && /^\d{2}:\d{2}$/.test(time) && Number.isFinite(mins)) {
        const [h, m] = time.split(":").map(Number);
        const end = h * 60 + m + mins;
        if (end < 24 * 60) {
          time = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
        }
      }
      return [
        ...old,
        { who: "", artistId: last?.artistId ?? artists[0]?.id ?? "", time, minutes: last?.minutes ?? "45", price: "" },
      ];
    });
  }

  if (state.ok) {
    return (
      <div className="card p-6">
        <h2 className="section-title">Booked in</h2>
        <p className="hint mt-1.5">
          {state.made} {state.made === 1 ? "appointment" : "appointments"} made, all tied
          together.
        </p>

        {state.skipped && state.skipped.length > 0 && (
          <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
            <strong>{state.skipped.join(", ")} could not go in</strong> — that time was
            already taken in their diary. Everybody else is booked; add them separately
            once you have found a slot.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/diary" className="btn bg-accent text-on-accent">
            See it in the diary
          </Link>
          <Link href="/diary/group" className="btn-ghost">
            Book another
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <section className="card p-5">
        <label className="block">
          <span className="label">What to call it</span>
          <input
            name="name"
            placeholder="Sarah's wedding"
            className="input"
            required
            autoFocus
          />
          <span className="hint">
            Whose wedding, which family, or the address. It is what you will look for
            later.
          </span>
        </label>

        <label className="mt-4 block">
          <span className="label">The day</span>
          <input name="date" type="date" defaultValue={today} className="input max-w-xs" required />
        </label>

        <label className="mt-4 block">
          <span className="label">Anything worth remembering</span>
          <input
            name="notes"
            placeholder="Arriving together at half nine, photographer at twelve"
            className="input"
          />
        </label>
      </section>

      <section className="card p-5">
        <h2 className="section-title">Who is coming</h2>
        <p className="hint mt-1 max-w-prose">
          One line each. Leave a line blank and it is ignored, so there is no harm in
          having a spare.
        </p>

        <div className="mt-4 space-y-3">
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-xl border border-border bg-surface-2/40 p-3 sm:grid-cols-[1fr_auto_auto_auto]"
            >
              {/*
                * The same search as anywhere else a client is picked.
                *
                * A wedding party is half regulars and half people who have
                * never been in, and typing a regular's name as a bare string
                * gives her a second record and loses everything the salon
                * knows about her. Typing a name that matches nobody is still
                * fine — it makes them a client, which is what it does on the
                * ordinary form too.
                */}
              <div className="min-w-0 sm:col-span-1">
                <span className="sr-only">Who, line {i + 1}</span>
                <ClientPicker
                  name={`who_${i}`}
                  idName={`contact_${i}`}
                  placeholder={i === 0 ? "The bride" : "Search, or type a name"}
                  onChosen={() => undefined}
                />
              </div>

              <label>
                <span className="sr-only">With, line {i + 1}</span>
                <select
                  name={`artist_${i}`}
                  value={row.artistId}
                  onChange={(e) => set(i, { artistId: e.target.value })}
                  className="input sm:w-36"
                >
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name.split(" ")[0]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="sr-only">At, line {i + 1}</span>
                <input
                  name={`time_${i}`}
                  type="time"
                  value={row.time}
                  onChange={(e) => set(i, { time: e.target.value })}
                  className="input sm:w-28"
                />
              </label>

              <label>
                <span className="sr-only">Minutes, line {i + 1}</span>
                <input
                  name={`minutes_${i}`}
                  type="number"
                  min={5}
                  step={5}
                  value={row.minutes}
                  onChange={(e) => set(i, { minutes: e.target.value })}
                  className="input sm:w-24"
                />
              </label>

              <label className="sm:col-span-4">
                <span className="sr-only">Price, line {i + 1}</span>
                <input
                  name={`price_${i}`}
                  inputMode="decimal"
                  value={row.price}
                  onChange={(e) => set(i, { price: e.target.value })}
                  placeholder="What this one comes to, if you know"
                  className="input"
                />
              </label>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="btn-ghost mt-3">
          Add another
        </button>
      </section>

      {state.error && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{state.error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn bg-accent text-on-accent">Book them all in</button>
        <Link href="/diary" className="btn-ghost">
          Cancel
        </Link>
        <span className="hint">
          A clash skips that one and books the rest &mdash; you will be told who.
        </span>
      </div>
    </form>
  );
}
