"use client";

import { useState } from "react";
import { useActionState } from "react";
import { saveBand, type FormState } from "../actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import { penceToInput } from "@/lib/money";
import type { PriceBand } from "@/lib/types";

/**
 * A service, priced one of two ways.
 *
 * By the hour suits trades that sell time — tattooing, colour work. A flat
 * price suits everyone else, and the two mix within one business, so this is
 * chosen per service rather than per studio.
 */
export function BandEditor({ band, index }: { band?: PriceBand; index: number }) {
  const [state, action] = useActionState<FormState, FormData>(saveBand, {});
  const [fixed, setFixed] = useState(band?.price_low_pence != null);

  return (
    <form action={action} className="border-t border-border px-5 py-4">
      {band && <input type="hidden" name="id" value={band.id} />}
      <input type="hidden" name="sort_order" value={band?.sort_order ?? index} />
      <input type="hidden" name="pricing" value={fixed ? "fixed" : "hourly"} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <input
            name="size_label"
            defaultValue={band?.size_label ?? ""}
            placeholder="Service name"
            className="input"
            required
          />
        </div>

        {fixed ? (
          <>
            <div className="w-28">
              <label className="hint mb-1 block">Price £</label>
              <input
                name="price_low"
                defaultValue={penceToInput(band?.price_low_pence)}
                placeholder="18"
                className="input"
                required
              />
            </div>
            <div className="w-28">
              <label className="hint mb-1 block">to £ (opt)</label>
              <input
                name="price_high"
                defaultValue={penceToInput(band?.price_high_pence)}
                placeholder="—"
                className="input"
              />
            </div>
            <div className="w-24">
              <label className="hint mb-1 block">Minutes</label>
              <input
                type="number"
                name="duration_minutes"
                min={5}
                max={1440}
                step={5}
                defaultValue={band?.duration_minutes ?? 30}
                className="input"
                required
              />
            </div>
          </>
        ) : (
          <>
            <div className="w-24">
              <label className="hint mb-1 block">Hours from</label>
              <input
                name="hours_low"
                type="number"
                step="0.25"
                min="0.25"
                defaultValue={band?.hours_low ?? ""}
                className="input"
                required
              />
            </div>
            <div className="w-24">
              <label className="hint mb-1 block">to</label>
              <input
                name="hours_high"
                type="number"
                step="0.25"
                min="0.25"
                defaultValue={band?.hours_high ?? ""}
                className="input"
                required
              />
            </div>
          </>
        )}

        <label className="flex w-32 shrink-0 items-center gap-2 pb-2 text-xs text-muted">
          <input
            type="checkbox"
            name="requires_consultation"
            defaultChecked={band?.requires_consultation}
            className="accent-[var(--accent)]"
          />
          Consult first
        </label>

        <SubmitButton className="btn-ghost">{band ? "Save" : "Add"}</SubmitButton>
        {band && (
          <button
            type="submit"
            name="intent"
            value="delete"
            formNoValidate
            className="btn-danger"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className="hint flex items-center gap-2">
          <input
            type="checkbox"
            checked={fixed}
            onChange={(e) => setFixed(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Fixed price rather than by the hour
        </label>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
