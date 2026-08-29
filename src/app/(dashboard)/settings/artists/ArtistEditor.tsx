"use client";

import { useActionState } from "react";
import { saveArtist, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { penceToInput, formatPence } from "@/lib/money";
import { TATTOO_STYLES, type Artist } from "@/lib/types";

export function ArtistEditor({ artist }: { artist?: Artist }) {
  const [state, action] = useActionState<FormState, FormData>(saveArtist, {});
  const isNew = !artist;

  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            {artist?.name ?? "Add an artist"}
            {artist && !artist.active && (
              <span className="ml-2 text-xs text-muted">(inactive)</span>
            )}
          </div>
          {artist && (
            <div className="hint mt-0.5">
              {formatPence(artist.hourly_rate_pence)}/hour · minimum{" "}
              {formatPence(artist.min_charge_pence)}
              {artist.calendar_id ? "" : " · no calendar connected"}
            </div>
          )}
        </div>
        <span className="text-xs text-muted group-open:hidden">Edit</span>
      </summary>

      <form action={action} className="space-y-5 border-t border-border p-5">
        {artist && <input type="hidden" name="id" value={artist.id} />}

        <Field label="Name">
          <input name="name" defaultValue={artist?.name ?? ""} className="input max-w-sm" required />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Hourly rate (£)">
            <input
              name="hourly_rate"
              className="input"
              defaultValue={penceToInput(artist?.hourly_rate_pence)}
              placeholder="120"
              required
            />
          </Field>
          <Field label="Minimum charge (£)">
            <input
              name="min_charge"
              className="input"
              defaultValue={penceToInput(artist?.min_charge_pence)}
              placeholder="80"
              required
            />
          </Field>
          <Field label="Day rate (£)">
            <input
              name="day_rate"
              className="input"
              defaultValue={penceToInput(artist?.day_rate_pence)}
              placeholder="optional"
            />
          </Field>
        </div>

        <Field label="Styles" hint="Used to route enquiries to the right artist.">
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {TATTOO_STYLES.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="styles"
                  value={s.value}
                  defaultChecked={artist?.styles?.includes(s.value)}
                  className="accent-[var(--accent)]"
                />
                {s.label}
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Google Calendar ID"
          hint="Availability is read from this calendar. Leave blank until it is connected."
        >
          <input
            name="calendar_id"
            defaultValue={artist?.calendar_id ?? ""}
            placeholder="artist@livingcanvastattoo.ink"
            className="input max-w-md font-mono text-xs"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={artist?.active ?? true}
            className="accent-[var(--accent)]"
          />
          Taking bookings
        </label>

        <div className="flex items-center gap-4 pt-1">
          <SubmitButton>{isNew ? "Add artist" : "Save"}</SubmitButton>
          <FormMessage state={state} />
          <div className="flex-1" />
          {artist && (
            <button
              type="submit"
              name="intent"
              value="delete"
              formNoValidate
              className="btn-danger"
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
