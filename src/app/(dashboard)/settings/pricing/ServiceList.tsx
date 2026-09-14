"use client";

import { useActionState, useState } from "react";
import { saveService, retireService, type ServiceState } from "./serviceActions";
import { formatPence, formatRange, penceToInput } from "@/lib/money";
import type { Service } from "@/lib/types";

/**
 * The price list: what this business sells, and how long it takes.
 *
 * Services and products together, because a salon thinks of them together —
 * the same list is what somebody reads out over the phone. They are separated
 * by a heading rather than a tab, so a quiet shelf of retail does not get its
 * own screen and then get forgotten.
 *
 * The owner's, like every price. What each person charges for something on
 * this list is theirs, and lives on their own settings.
 */
export function ServiceList({
  services,
  words,
  only,
}: {
  services: Service[];
  words: { customer: string };
  /**
   * Show one half of the list rather than both.
   *
   * For a business that prices its work by the hour against size bands. Its
   * work is on the bands screen and there is nothing to put under "what you
   * do" — but a tattoo studio still sells aftercare balm, and until this there
   * was no screen in the product where it could put one. The balm could be
   * sold from the till and from an appointment, and could not be created,
   * priced or taken off sale anywhere at all.
   */
  only?: "service" | "product";
}) {
  const [adding, setAdding] = useState<"service" | "product" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const bookable = services.filter((s) => s.kind === "service");
  const retail = services.filter((s) => s.kind === "product");

  return (
    <div className="space-y-6">
      {only !== "product" && <Group
        title="What you do"
        blurb={`Anything that takes time and goes in the diary. The length is what the assistant offers a ${words.customer}, so it wants to be the truth rather than the best case.`}
        items={bookable}
        empty="Nothing on the list yet. Until there is, the assistant cannot put a price on anything."
        editing={editing}
        setEditing={setEditing}
        onAdd={() => setAdding("service")}
        addLabel="Add something you do"
      />}

      {only !== "service" && <Group
        title="What you sell"
        blurb="Anything that takes no time — shampoo, aftercare, a gift card. It can be sold without an appointment and never appears in the diary."
        items={retail}
        empty="Nothing yet. Worth adding if you sell anything over the counter."
        editing={editing}
        setEditing={setEditing}
        onAdd={() => setAdding("product")}
        addLabel="Add something you sell"
      />}

      {adding && (
        <ServiceForm
          kind={adding}
          onDone={() => setAdding(null)}
          sortOrder={services.length}
        />
      )}
    </div>
  );
}

function Group({
  title,
  blurb,
  items,
  empty,
  editing,
  setEditing,
  onAdd,
  addLabel,
}: {
  title: string;
  blurb: string;
  items: Service[];
  empty: string;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          <p className="hint mt-1 max-w-prose">{blurb}</p>
        </div>
        <button type="button" onClick={onAdd} className="btn-ghost shrink-0">
          {addLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="hint mt-4">{empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) =>
            editing === item.id ? (
              <li key={item.id} className="py-3">
                <ServiceForm
                  kind={item.kind}
                  service={item}
                  onDone={() => setEditing(null)}
                  sortOrder={item.sort_order}
                />
              </li>
            ) : (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span className="font-medium">{item.name}</span>

                {item.minutes != null && (
                  <span className="hint tabular-nums">{item.minutes} min</span>
                )}

                <span className="hint tabular-nums">{priceOf(item)}</span>

                {item.requires_consultation && (
                  <span className="pill bg-surface-2 text-muted">consultation first</span>
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
    </section>
  );
}

/** "£30", "£120 – £160", or the honest admission that nothing is set. */
function priceOf(item: Service): string {
  if (item.price_pence == null) return "no price set";
  if (item.price_to_pence != null && item.price_to_pence !== item.price_pence) {
    return formatRange(item.price_pence, item.price_to_pence);
  }
  return formatPence(item.price_pence);
}

function ServiceForm({
  kind,
  service,
  onDone,
  sortOrder,
}: {
  kind: "service" | "product";
  service?: Service;
  onDone: () => void;
  sortOrder: number;
}) {
  const [state, action] = useActionState<ServiceState, FormData>(saveService, {});
  const [retireState, retire] = useActionState<ServiceState, FormData>(retireService, {});

  if (state.ok || retireState.ok) {
    // The page has been revalidated underneath; close and show the new row.
    queueMicrotask(onDone);
  }

  return (
    <form action={action} className="rounded-xl border border-border bg-surface-2/40 p-4">
      <input type="hidden" name="id" value={service?.id ?? ""} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="sort_order" value={sortOrder} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Name</span>
          <input
            name="name"
            defaultValue={service?.name ?? ""}
            placeholder={kind === "product" ? "Shampoo, 250ml" : "Cut and blow dry"}
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

        {/*
          * How many are left, and nothing else.
          *
          * There was a "what it cost you" box here too, and it was taken out:
          * this is not a stock-control system and nobody running a salon wants
          * to keep a cost price current against four bottles in order to be
          * told a margin they already know. A product here exists to be
          * charged for, not accounted for.
          *
          * The count stays because it answers a question somebody actually
          * asks at the till — have we got any — and it keeps itself up to date
          * as things sell rather than needing maintenance.
          *
          * Empty is not nought: nought says the shelf is bare, empty says you
          * are not counting these, and most businesses are not.
          */}
        {kind === "product" && (
          <label>
            <span className="label">How many left</span>
            <input
              name="stock"
              type="number"
              min={0}
              step={1}
              defaultValue={service?.stock ?? ""}
              placeholder="Leave empty to not count"
              className="input"
            />
            <span className="hint">
              Counts down as they sell. Empty means you are not counting these.
            </span>
          </label>
        )}
      </div>

      {kind === "service" && (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="requires_consultation"
              defaultChecked={service?.requires_consultation ?? false}
              className="mt-0.5"
            />
            <span>
              Somebody has to be seen first
              <span className="hint block">
                The assistant books a consultation instead of this, and never offers it
                straight off.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="bookable_online"
              defaultChecked={service?.bookable_online ?? true}
              className="mt-0.5"
            />
            <span>
              The assistant may offer this
              <span className="hint block">
                Off keeps it on your list for the diary without offering it to somebody
                who has not asked for it by name.
              </span>
            </span>
          </label>
        </div>
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
            Take it off the list
          </button>
        )}
      </div>
    </form>
  );
}
