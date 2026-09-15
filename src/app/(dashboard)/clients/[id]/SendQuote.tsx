"use client";

import { useActionState, useState } from "react";
import { sendQuote, type FormActionState } from "../../formActions";
import { formatPence } from "@/lib/money";

type Line = { key: number; name: string; qty: string; price: string };
let nextKey = 1;

/**
 * A quote for this person, written line by line.
 *
 * A description and a price per line, a total that adds itself up, how long
 * it stands, and a note. It goes as a link they open, read, accept and sign —
 * and the signed copy is the record of what was agreed at what price.
 */
export function SendQuote({
  contactId,
  firstName,
  channels,
  mayMessage,
  team = [],
  me = null,
}: {
  contactId: string;
  firstName: string;
  /** Who could be named on the quote. */
  team?: { id: string; name: string }[];
  /** The signed-in person, if they are one of the team. */
  me?: string | null;
  channels: { channel: string; label: string }[];
  mayMessage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, name: "", qty: "1", price: "" }]);
  const [state, action, pending] = useActionState<FormActionState, FormData>(sendQuote, {});
  const [copied, setCopied] = useState(false);

  const pence = (raw: string) => {
    const n = Number(raw.replace(/[£,\s]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };
  const total = lines.reduce((sum, l) => sum + pence(l.price) * Math.max(1, Number(l.qty) || 1), 0);
  const set = (key: number, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn w-full border border-border">
        Send a quote
      </button>
    );
  }

  if (state.ok && (state.sent ?? 0) > 0) {
    return (
      <div className="space-y-2 rounded-xl bg-ok/5 p-3 text-sm">
        <p className="text-ok">
          Quote {state.url && !channels.length ? "made" : `sent to ${firstName}`}. It shows as accepted here once they sign it.
        </p>
        {state.note && <p className="hint text-xs">{state.note}</p>}
        {state.url && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(state.url ?? "").then(() => setCopied(true))}
              className="btn border border-border text-sm"
            >
              {copied ? "Copied" : "Copy the link"}
            </button>
            <a href={state.url} target="_blank" rel="noreferrer" className="btn border border-border text-sm">
              Open it
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-surface-2/40 p-3">
      <input type="hidden" name="contact_id" value={contactId} />
      <span className="label">The quote</span>
      {lines.map((l, i) => (
        <div key={l.key} className="grid grid-cols-[1fr_3rem_5.5rem_auto] items-center gap-1.5">
          <input
            id={`q-name-${l.key}`}
            name={`line_name_${i}`}
            value={l.name}
            onChange={(e) => set(l.key, { name: e.target.value })}
            placeholder={i === 0 ? "What the work is" : "Another line"}
            className="input min-w-0 py-1.5 text-sm"
          />
          <input
            id={`q-qty-${l.key}`}
            name={`line_qty_${i}`}
            value={l.qty}
            onChange={(e) => set(l.key, { qty: e.target.value })}
            inputMode="numeric"
            aria-label="How many"
            className="input py-1.5 text-center text-sm tabular-nums"
          />
          <input
            id={`q-price-${l.key}`}
            name={`line_price_${i}`}
            value={l.price}
            onChange={(e) => set(l.key, { price: e.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Price each"
            className="input py-1.5 text-right text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={() => setLines((all) => (all.length > 1 ? all.filter((x) => x.key !== l.key) : all))}
            className="px-1 text-sm text-muted hover:text-warn"
            aria-label="Remove line"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-baseline justify-between">
        <button
          type="button"
          onClick={() => setLines((all) => [...all, { key: nextKey++, name: "", qty: "1", price: "" }])}
          className="text-sm text-accent hover:underline"
        >
          + Add a line
        </button>
        <span className="font-semibold tabular-nums">{formatPence(total)}</span>
      </div>

      {team.length > 0 && (
        <label className="block">
          <span className="label">From (optional)</span>
          <select id={`q-by-${contactId}`} name="by_artist_id" defaultValue={me ?? ""} className="input text-sm">
            <option value="">Just the business</option>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="label">A note (optional)</span>
        <textarea id={`q-note-${contactId}`} name="note" rows={2} className="input text-sm" placeholder="What is included, access, timings…" />
      </label>
      <label className="block">
        <span className="label">Valid for</span>
        <select id={`q-valid-${contactId}`} name="valid_days" defaultValue="30" className="input text-sm">
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {mayMessage &&
          channels.map((c) => (
            <button key={c.channel} name="send_on" value={c.channel} disabled={pending} className="btn bg-accent text-sm text-on-accent disabled:opacity-60">
              Send by {c.label.toLowerCase()}
            </button>
          ))}
        <button name="send_on" value="" disabled={pending} className="btn border border-border text-sm">
          Just make the link
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">
          Cancel
        </button>
      </div>
      {state.error && <p className="text-sm text-warn">{state.error}</p>}
      {state.unreached && state.unreached.length > 0 && (
        <p className="text-sm text-warn">It could not reach {firstName} that way. Make the link and give it to them.</p>
      )}
    </form>
  );
}
