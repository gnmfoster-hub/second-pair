"use client";

import { useActionState, useState } from "react";
import { saveMyService, retireMyService, type MyServiceState } from "./myServiceActions";
import { penceToInput } from "@/lib/money";
import { describePrice } from "@/lib/servicePrices";
import type { Service } from "@/lib/types";

/**
 * Things only this person does.
 *
 * A nail technician inside a salon has her own list — gels, wraps, removals,
 * twenty colours — and none of it belongs on the salon's price list, because
 * no stylist there does any of it. Until now it either cluttered the shop's
 * list for everybody or did not exist, and only the owner could add it either
 * way.
 *
 * Kept separate from the shop's list on purpose. Two lists on one screen would
 * invite somebody to put a haircut here, and the difference matters: the
 * assistant offers these only to somebody booking with this person, and offers
 * the shop's to anybody.
 */
export function MyServices({
  services,
  firstName,
  artistId = null,
  title,
}: {
  /** Only this person's own. The shop's list is somebody else's screen. */
  services: Service[];
  firstName: string;
  /**
   * Whose list this is, when it is not the reader's own.
   *
   * Null means the signed-in person, which is what their own settings page
   * wants and the only thing this could do before. Set, it is the owner
   * setting somebody up — and the action checks that claim against
   * studio_members rather than believing the field.
   */
  artistId?: string | null;
  /** Overrides the heading, which reads wrongly about somebody else. */
  title?: { heading: string; blurb: string };
}) {
  const [adding, setAdding] = useState<"service" | "product" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const bookable = services.filter((s) => s.kind === "service");
  const retail = services.filter((s) => s.kind === "product");

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">{title?.heading ?? "Things only you do"}</h2>
          <p className="hint mt-1 max-w-prose">
            {title?.blurb ?? (
              <>
                Work and products that are yours rather than the shop&rsquo;s &mdash; a
                nail technician&rsquo;s colours, a piercer&rsquo;s jewellery. The assistant
                offers these only to somebody asking for {firstName}, and never to
                somebody booking with anyone else.
              </>
            )}
          </p>
        </div>
        {!adding && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setAdding("service")} className="btn-ghost">
              Add something you do
            </button>
            <button type="button" onClick={() => setAdding("product")} className="btn-ghost">
              Add a product
            </button>
          </div>
        )}
      </div>

      {services.length === 0 && !adding && (
        <p className="hint mt-4">
          Nothing yet. Most people need none of this &mdash; it is for work the rest of
          the shop does not do.
        </p>
      )}

      {services.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {[...bookable, ...retail].map((item) =>
            editing === item.id ? (
              <li key={item.id} className="py-3">
                <MyServiceForm
                  kind={item.kind}
                  service={item}
                  onDone={() => setEditing(null)}
                  sortOrder={item.sort_order}
                  artistId={artistId}
                />
              </li>
            ) : (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
              >
                <span className="font-medium">{item.name}</span>
                {item.minutes != null && (
                  <span className="hint tabular-nums">{item.minutes} min</span>
                )}
                <span className="hint tabular-nums">{describePrice(item)}</span>
                {item.kind === "product" && (
                  <span className="pill bg-surface-2 text-muted">product</span>
                )}
                {!item.bookable_online && (
                  <span className="pill bg-surface-2 text-muted">not offered online</span>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(item.id)}
                  className="ml-auto text-sm text-muted hover:text-foreground"
                >
                  Edit
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {adding && (
        <div className="mt-4">
          <MyServiceForm
            kind={adding}
            onDone={() => setAdding(null)}
            sortOrder={services.length}
            artistId={artistId}
          />
        </div>
      )}
    </section>
  );
}

function MyServiceForm({
  kind,
  service,
  onDone,
  sortOrder,
  artistId,
}: {
  kind: "service" | "product";
  service?: Service;
  onDone: () => void;
  sortOrder: number;
  /** Whose list, when the owner is filling somebody else's in. */
  artistId: string | null;
}) {
  const [state, action] = useActionState<MyServiceState, FormData>(saveMyService, {});
  const [retireState, retire] = useActionState<MyServiceState, FormData>(
    retireMyService,
    {},
  );

  if (state.ok || retireState.ok) {
    // The page has been revalidated underneath; close and show the new row.
    queueMicrotask(onDone);
  }

  return (
    <form action={action} className="rounded-xl border border-border bg-surface-2/40 p-4">
      <input type="hidden" name="id" value={service?.id ?? ""} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="sort_order" value={sortOrder} />
      {/*
        * Only sent when the owner is filling in somebody else's list, and only
        * honoured for an owner — the action checks that against
        * studio_members rather than believing this field.
        */}
      {artistId && <input type="hidden" name="artist_id" value={artistId} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Name</span>
          <input
            name="name"
            defaultValue={service?.name ?? ""}
            placeholder={kind === "product" ? "Gel top coat" : "Gel infill"}
            className="input"
            required
            autoFocus
          />
        </label>

        {kind === "service" && (
          <label>
            <span className="label">How long, in minutes</span>
            <input
              name="minutes"
              type="number"
              min={5}
              step={5}
              defaultValue={service?.minutes ?? ""}
              placeholder="45"
              className="input"
            />
          </label>
        )}

        <label>
          <span className="label">Price</span>
          <input
            name="price"
            inputMode="decimal"
            defaultValue={penceToInput(service?.price_pence)}
            placeholder="30.00"
            className="input"
          />
        </label>

        {kind === "service" && (
          <label>
            <span className="label">Up to, if it varies</span>
            <input
              name="price_to"
              inputMode="decimal"
              defaultValue={penceToInput(service?.price_to_pence)}
              placeholder="Leave empty for one price"
              className="input"
            />
          </label>
        )}
      </div>

      {kind === "service" && (
        <label className="mt-3 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="bookable_online"
            defaultChecked={service?.bookable_online ?? true}
            className="mt-0.5"
          />
          <span>
            The assistant may offer this
            <span className="hint block">
              Off keeps it on your list for the diary without offering it to somebody who
              has not asked for it by name.
            </span>
          </span>
        </label>
      )}

      {state.error && <p className="mt-3 text-sm text-warn">{state.error}</p>}
      {retireState.error && <p className="mt-3 text-sm text-warn">{retireState.error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn bg-accent text-on-accent">
          {service ? "Save" : "Add it"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancel
        </button>

        {service && (
          <button
            formAction={retire}
            className="ml-auto text-sm text-muted hover:text-warn"
            title="Kept on past bookings, taken off the list"
          >
            Take it off your list
          </button>
        )}
      </div>
    </form>
  );
}
