"use client";

import { useActionState, useState } from "react";
import { addStarter, type FormActionState } from "../../formActions";

type Item = { key: string; name: string; blurb: string; added: boolean };

/** Ready-made forms for this trade first, everything else folded beneath. */
export function StarterPicker({ trade, suggested, others }: { trade: string; suggested: Item[]; others: Item[] }) {
  const [more, setMore] = useState(false);
  return (
    <section className="card p-5">
      <h2 className="section-title">Ready-made for {trade.toLowerCase()}</h2>
      <ul className="mt-3 divide-y divide-border">
        {suggested.map((s) => (
          <Row key={s.key} item={s} />
        ))}
      </ul>
      {others.length > 0 && (
        <>
          <button type="button" onClick={() => setMore((m) => !m)} className="mt-3 text-sm text-accent hover:underline">
            {more ? "Hide the others" : `Show ${others.length} more`}
          </button>
          {more && (
            <ul className="mt-2 divide-y divide-border">
              {others.map((s) => (
                <Row key={s.key} item={s} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Row({ item }: { item: Item }) {
  const [state, action, pending] = useActionState<FormActionState, FormData>(addStarter, {});
  const added = item.added || state.ok;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="font-medium">{item.name}</div>
        <div className="hint text-xs">{item.blurb}</div>
        {state.error && <div className="text-xs text-warn">{state.error}</div>}
      </div>
      <form action={action}>
        <input type="hidden" name="starter" value={item.key} />
        <button disabled={pending || added} className="btn border border-border text-sm disabled:opacity-60">
          {added ? "Added" : pending ? "Adding…" : "Add"}
        </button>
      </form>
    </li>
  );
}
