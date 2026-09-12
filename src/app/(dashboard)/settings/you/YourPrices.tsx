"use client";

import { useActionState } from "react";
import { saveMyPrices, type PriceState } from "./priceActions";
import { penceToInput } from "@/lib/money";
import { describePrice } from "@/lib/servicePrices";
import type { Service, ServicePerson } from "@/lib/types";

/**
 * What this person charges, against what the price list says.
 *
 * The list is shown first on every row and the boxes are empty, because empty
 * is the right answer for nearly everything: a business with five people and
 * thirty services would otherwise face a hundred and fifty boxes to fill in
 * before it could quote anything, and would keep its prices on a wall instead.
 *
 * So the shop's number is always visible, and typing over it is the exception
 * somebody makes deliberately — a senior charging more, a junior taking longer
 * — rather than a form demanding an answer for every line.
 */
export function YourPrices({
  services,
  mine,
  firstName,
}: {
  services: Service[];
  /** This person's overrides, keyed by service. Usually nearly empty. */
  mine: Map<string, ServicePerson>;
  firstName: string;
}) {
  const [state, action] = useActionState<PriceState, FormData>(saveMyPrices, {});

  const bookable = services.filter((s) => s.kind === "service");

  if (bookable.length === 0) {
    return (
      <div className="card p-5">
        <div className="section-title">Your prices</div>
        <p className="hint mt-1.5 max-w-prose">
          Nothing on the price list yet, so there is nothing to price differently. Whoever
          owns the business adds what you all do first, and then this fills in.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card p-5">
      <div className="section-title">Your prices</div>
      <p className="hint mt-1.5 max-w-prose">
        What the assistant quotes when somebody asks for you by name. Leave a row alone
        and you are on the shop&rsquo;s price, which is what most of these should be
        &mdash; fill one in only where you genuinely differ. Nobody else can change these.
      </p>

      <div className="mt-5 hidden gap-3 px-1 text-xs uppercase tracking-wide text-muted sm:flex">
        <span className="flex-1">What you do</span>
        <span className="w-28">On the list</span>
        <span className="w-28">Your price</span>
        <span className="w-28">Your minutes</span>
      </div>

      <ul className="mt-1.5 divide-y divide-border">
        {bookable.map((s) => {
          const row = mine.get(s.id);
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 sm:flex-nowrap"
            >
              <span className="min-w-0 flex-1 basis-full truncate font-medium sm:basis-auto">
                {s.name}
              </span>

              {/*
               * The shop's answer, always in view. Without it somebody cannot
               * tell whether their empty box means "£30" or "nothing set", and
               * those are very different things to leave alone.
               */}
              <span className="hint w-28 shrink-0 tabular-nums">
                {describePrice(s)}
                {s.minutes != null && (
                  <span className="block text-xs">{s.minutes} min</span>
                )}
              </span>

              <label className="w-28 shrink-0">
                <span className="sr-only">Your price for {s.name}</span>
                <input
                  name={`price_${s.id}`}
                  inputMode="decimal"
                  defaultValue={penceToInput(row?.price_pence)}
                  placeholder={penceToInput(s.price_pence) || "—"}
                  className="input"
                />
              </label>

              <label className="w-28 shrink-0">
                <span className="sr-only">Your minutes for {s.name}</span>
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
        <button className="btn bg-accent text-on-accent">Save your prices</button>
        {state.error && <p className="text-sm text-bad">{state.error}</p>}
        {state.ok && (
          <p className="text-sm text-ok">
            {state.saved === 0
              ? `Saved. ${firstName} is on the shop's prices for everything.`
              : `Saved. ${state.saved} of your own, the rest on the shop's prices.`}
          </p>
        )}
      </div>

      <p className="hint mt-3 max-w-prose">
        Clearing both boxes on a row puts you back on the shop&rsquo;s price for it.
      </p>
    </form>
  );
}
