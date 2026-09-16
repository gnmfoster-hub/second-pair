"use client";

import { Explain } from "@/components/Explain";

import { useActionState, useState } from "react";
import { saveTeamPrices, type TeamPriceState } from "./serviceActions";
import { penceToInput } from "@/lib/money";
import { describePrice } from "@/lib/servicePrices";
import type { Artist, Service, ServicePerson } from "@/lib/types";

/**
 * What each person charges for the things on the list.
 *
 * Each person can already set their own on their own page, and that is the
 * right default — a stylist's price is hers. But an owner setting a salon up
 * cannot wait for five people to sign in and fill a form in, and half of them
 * have no login at all. The database has permitted the owner to do this since
 * the table was written; there was simply no screen.
 *
 * One person at a time rather than a grid. Five people against thirty services
 * is a hundred and fifty boxes, and a wall of boxes is a page nobody finishes
 * — where "Sarah, then Chloe" is a job somebody can stop halfway through and
 * come back to.
 */
export function PeoplePrices({
  artists,
  services,
  rows,
  words,
}: {
  artists: Artist[];
  services: Service[];
  /** Everybody's overrides. Usually a short list. */
  rows: ServicePerson[];
  words: { practitioner: string; practitioners: string; business?: string };
}) {
  const [whoId, setWhoId] = useState<string>(artists[0]?.id ?? "");
  const [state, action] = useActionState<TeamPriceState, FormData>(saveTeamPrices, {});

  const bookable = services.filter((s) => s.kind === "service");
  const who = artists.find((a) => a.id === whoId);

  if (artists.length === 0 || bookable.length === 0) return null;

  const mine = new Map(
    rows.filter((r) => r.artist_id === whoId).map((r) => [r.service_id, r]),
  );

  /** How many of this person's prices differ from the shop's. */
  const countFor = (id: string) => rows.filter((r) => r.artist_id === id).length;

  return (
    <section className="card p-5">
      <h2 className="section-title">
        What each {words.practitioner} charges
        <Explain label="How their own prices work">
          Clearing both boxes on a row puts them back on the{" "}
          {words.business ?? "business"}&rsquo;s price. They can change their own on their
          settings too &mdash; whoever saved last wins, as it would if you were both writing
          on the same wall.
        </Explain>
      </h2>
      <p className="hint mt-1 max-w-prose">
        Only where they differ from the list above. Everybody is on the {words.business ?? "business"}&rsquo;s price
        until you say otherwise, which is what most of these should stay &mdash; a senior
        who charges more for something is the exception worth typing in.
      </p>

      {/*
       * Who you are editing, as chips rather than a dropdown: the count beside
       * each name is the thing an owner actually wants to see, and a dropdown
       * hides it behind a click.
       */}
      <div className="mt-4 flex flex-wrap gap-2">
        {artists.map((a) => {
          const n = countFor(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setWhoId(a.id)}
              className={`pill ${
                a.id === whoId ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"
              }`}
            >
              {a.name.split(" ")[0]}
              {n > 0 && <span className="ml-1.5 tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {who && (
        <form action={action} key={whoId} className="mt-5">
          <input type="hidden" name="artist_id" value={whoId} />

          {/*
            * The sentinel saying these ticks were on screen at all.
            *
            * An unticked box and an absent one look identical in a submission,
            * so without this a save from anywhere that does not show them would
            * read as "they do none of it" and take somebody off the entire
            * price list in one press.
            */}
          <input type="hidden" name="touch_offered" value="1" />

          <div className="hidden gap-3 px-1 text-xs uppercase tracking-wide text-muted sm:flex">
            <span className="w-12">Does it</span>
            <span className="flex-1">What you do</span>
            <span className="w-28">On the list</span>
            <span className="w-28">{who.name.split(" ")[0]}&rsquo;s price</span>
            <span className="w-28">Their minutes</span>
          </div>

          <ul className="mt-1.5 divide-y divide-border">
            {bookable.map((s) => {
              const row = mine.get(s.id);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 sm:flex-nowrap"
                >
                  {/*
                    * Whether they do it at all, which decides everything to
                    * the right of it.
                    *
                    * Unticked, the assistant stops offering them for this —
                    * it will not quote a junior for balayage at a price she
                    * never set, and somebody turning up for it is how that
                    * used to be found out.
                    */}
                  <label className="flex w-12 shrink-0 items-center gap-2">
                    <input
                      type="checkbox"
                      name={`offered_${s.id}`}
                      defaultChecked={row?.offered !== false}
                      className="accent-[var(--accent)]"
                    />
                    <span className="sr-only">
                      {who.name} does {s.name}
                    </span>
                  </label>

                  <span className="min-w-0 flex-1 basis-full truncate font-medium sm:basis-auto">
                    {s.name}
                  </span>

                  <span className="hint w-28 shrink-0 tabular-nums">
                    {describePrice(s)}
                    {s.minutes != null && (
                      <span className="block text-xs">{s.minutes} min</span>
                    )}
                  </span>

                  <label className="w-28 shrink-0">
                    <span className="sr-only">
                      {who.name}&rsquo;s price for {s.name}
                    </span>
                    <input
                      name={`price_${s.id}`}
                      inputMode="decimal"
                      defaultValue={penceToInput(row?.price_pence)}
                      placeholder={penceToInput(s.price_pence) || "—"}
                      className="input"
                    />
                  </label>

                  <label className="w-28 shrink-0">
                    <span className="sr-only">
                      {who.name}&rsquo;s minutes for {s.name}
                    </span>
                    <input
                      name={`minutes_${s.id}`}
                      type="number"
                      min={5}
                      step={5}
                      defaultValue={row?.minutes ?? ""}
                      placeholder={s.minutes != null ? String(s.minutes) : "—"}
                      className="input"
                    />
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button className="btn bg-accent text-on-accent">
              Save {who.name.split(" ")[0]}&rsquo;s prices
            </button>
            {state.error && <p className="text-sm text-warn">{state.error}</p>}
            {state.ok && <p className="text-sm text-ok">Saved.</p>}
          </div>


        </form>
      )}
    </section>
  );
}
