"use client";

import { useActionState } from "react";
import { allocateChannel, type FormState } from "../actions";
import { describe, type Person } from "@/lib/channels/whose";

/**
 * Who a connected channel belongs to.
 *
 * The one control behind a difference that is easy to miss and impossible to
 * undo quietly: on a shared line the assistant asks who the customer would
 * like, and on somebody's own line it never asks, because it has been told it
 * already knows. Everything downstream has honoured that since the column was
 * written; there has simply never been a way to decide it.
 *
 * Written once and used for every channel. A number, an Instagram account and
 * a Facebook page are all a way for one person to be reached, and a business
 * that gives a stylist her own Instagram will want to give her her own number
 * eventually — so the control is the same control, and a channel that cannot
 * be given away yet still says who it belongs to.
 */
export function WhoseChannel({
  connectionId,
  artistId,
  people,
  /** How many live connections this business has on this channel. */
  howMany,
  noun,
}: {
  connectionId: string;
  artistId: string | null;
  people: Person[];
  howMany: number;
  noun: string;
}) {
  const [state, action, saving] = useActionState<FormState, FormData>(allocateChannel, {});
  const working = people.filter((p) => p.active);

  /*
   * The last line on a channel stays with the business, and says why.
   *
   * Giving it to one person leaves a business with no way for a new customer
   * to reach it at all: every message goes to her and nobody else is ever
   * offered. It is a decision somebody might genuinely want, and not one to
   * arrive at by accident on the only line they have.
   */
  const onlyOne = howMany <= 1;

  return (
    <form action={action} className="mt-3 border-t border-border pt-3">
      <span className="label">Who it belongs to</span>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input type="hidden" name="connection" value={connectionId} />
        <select
          name="artist"
          defaultValue={artistId ?? ""}
          disabled={onlyOne || working.length === 0}
          className="input h-9 max-w-xs text-sm"
          aria-label="Who this channel belongs to"
        >
          <option value="">The whole business</option>
          {working.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button type="submit" className="btn-ghost py-1.5 text-sm" disabled={saving || onlyOne}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <p className="hint mt-1.5">{describe(artistId, people)}</p>

      {onlyOne && (
        <p className="hint mt-1">
          This is the only one you have on this channel, so it stays with the business, because a
          customer who has not met anybody yet needs a way in. Add a second and either can
          become somebody&rsquo;s own.
        </p>
      )}

      {working.length === 0 && !onlyOne && (
        <p className="hint mt-1">Nobody is working here at the moment, so there is nobody to give it to.</p>
      )}

      {state.error && (
        <p className="mt-1.5 text-xs text-warn" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="mt-1.5 text-xs text-ok">Saved. The next {noun} uses it.</p>}
    </form>
  );
}
