"use client";

import { useActionState } from "react";
import { saveBand, type FormState } from "../actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import type { PriceBand } from "@/lib/types";

export function BandEditor({ band, index }: { band?: PriceBand; index: number }) {
  const [state, action] = useActionState<FormState, FormData>(saveBand, {});

  return (
    <form action={action} className="border-t border-border px-5 py-3">
      {band && <input type="hidden" name="id" value={band.id} />}
      <input type="hidden" name="sort_order" value={band?.sort_order ?? index} />

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <input
            name="size_label"
            defaultValue={band?.size_label ?? ""}
            placeholder="Size name"
            className="input"
            required
          />
        </div>
        <div className="w-24">
          <input
            name="hours_low"
            type="number"
            step="0.5"
            min="0.5"
            defaultValue={band?.hours_low ?? ""}
            placeholder="From"
            className="input"
            required
          />
        </div>
        <div className="w-24">
          <input
            name="hours_high"
            type="number"
            step="0.5"
            min="0.5"
            defaultValue={band?.hours_high ?? ""}
            placeholder="To"
            className="input"
            required
          />
        </div>
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

      <div className="mt-2 empty:mt-0">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
