"use client";

import { useActionState } from "react";
import { saveArtist, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { penceToInput, formatPence } from "@/lib/money";
import { BookingSource } from "./BookingSource";
import { Avatar } from "@/components/Avatar";
import { OwnHours } from "./OwnHours";
import { RolePicker } from "./RolePicker";
import type { Artist, OpeningHours, ServiceOption } from "@/lib/types";

export function ArtistEditor({
  artist,
  studioHours,
  styles,
  noun,
  roles,
}: {
  artist?: Artist;
  /** Shown as the fallback when this person has no week of their own. */
  studioHours: OpeningHours[];
  styles: ServiceOption[];
  /** What this trade calls them: artist, stylist, engineer. */
  noun: string;
  /** The roles this trade usually has. Suggestions, not a fixed list. */
  roles: string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveArtist, {});
  const isNew = !artist;

  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
        {artist ? (
          <Avatar person={artist} size="md" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted">
            +
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            {artist?.name ?? `Add ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`}
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

        <div className="flex flex-wrap items-end gap-5">
          <Field label="Name">
            <input name="name" defaultValue={artist?.name ?? ""} className="input max-w-sm" required />
          </Field>

          <Field label="Email" hint="Only used to send them their login.">
            <input
              name="email"
              type="email"
              defaultValue={artist?.email ?? ""}
              className="input max-w-sm"
            />
          </Field>

          <Field
            label="What they do"
            hint="Optional. Shown to clients, and it lets the assistant answer &ldquo;who does piercings?&rdquo;"
          >
            <RolePicker suggested={roles} value={artist?.role ?? null} />
          </Field>

          <Field label="Photo" hint="Shown in the diary and to clients. Initials if left blank.">
            <div className="flex items-center gap-3">
              {artist && <Avatar person={artist} size="lg" />}
              <input
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp"
                className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
              />
            </div>
            {artist?.avatar_path && (
              <label className="hint mt-2 flex items-center gap-2">
                <input type="checkbox" name="remove_avatar" value="true" className="accent-[var(--accent)]" />
                Remove the photo
              </label>
            )}
          </Field>
        </div>

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

        <Field label="Styles" hint="Used to route enquiries to the right person.">
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {styles.map((s) => (
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

        <BookingSource artist={artist} />

        <OwnHours
          hours={artist?.hours ?? null}
          studioHours={studioHours}
          noun={noun}
        />

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
          <SubmitButton>{isNew ? `Add ${noun}` : "Save"}</SubmitButton>
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
