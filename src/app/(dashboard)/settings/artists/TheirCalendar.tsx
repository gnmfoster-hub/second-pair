"use client";

import { useActionState } from "react";
import { saveTeamCalendar, type FormState } from "../actions";
import type { Artist } from "@/lib/types";

/**
 * Connecting somebody else's own calendar, on their behalf.
 *
 * The other direction from the link beside it, and the half that was missing.
 * Everybody could be handed a feed of their diary going out; nobody but the
 * person signed in could connect the calendar they live by coming in — and in
 * a salon that is the owner and almost nobody else, because a stylist does not
 * need a login to cut hair.
 *
 * So the person most likely to be booked over their own dentist appointment
 * was the one with no way to prevent it and nobody to ask.
 *
 * Folded away, because most people will not use it and a settings page is
 * judged by how much of it you can ignore.
 */
export function TheirCalendar({ artist }: { artist: Artist }) {
  const [state, action] = useActionState<FormState, FormData>(saveTeamCalendar, {});
  const first = artist.name.split(" ")[0];
  const linked = Boolean(artist.personal_ical_url);

  return (
    <details className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        {first}&rsquo;s own calendar, blocking their time
        {linked && <span className="hint ml-2">connected</span>}
      </summary>

      <form action={action} className="mt-3">
        <input type="hidden" name="artist_id" value={artist.id} />

        <p className="hint max-w-prose">
          The opposite of the link above. Anything in the calendar {first} actually lives
          by, a dentist appointment, a school run, a funeral, stops them
          being booked over. We only ever read it; nothing here can change anything in
          their calendar.
        </p>

        <div className="mt-3">
          <label className="label" htmlFor={`ical-${artist.id}`}>
            Calendar address
          </label>
          <input
            id={`ical-${artist.id}`}
            name="personal_ical_url"
            type="url"
            defaultValue={artist.personal_ical_url ?? ""}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            className="input"
          />
          <span className="hint">
            Ends in .ics. Clear it to take it off. They can change it themselves if they
            sign in.
          </span>
        </div>

        {/*
         * The thing worth saying out loud before somebody pastes it.
         *
         * A secret calendar address is a credential: anybody holding it can read
         * that calendar. An owner doing this on somebody's behalf should know
         * they are being handed one, and that the person can take it back.
         */}
        <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
          <strong className="text-foreground">Ask {first} for the address</strong> rather
          than taking it from a shared computer. Anybody holding it can read that
          calendar, so it wants to be the one they keep appointments in rather than
          anything private, and they can change it at their end to stop it working
          anywhere.
        </div>

        {artist.personal_calendar_error && (
          <p className="mt-3 text-sm text-warn">
            Last read failed: {artist.personal_calendar_error}. Nothing from this calendar
            is blocking {first}&rsquo;s time until it works again.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-ghost text-sm">Save</button>
          {state.error && <p className="text-sm text-warn">{state.error}</p>}
          {state.ok && <p className="text-sm text-ok">Saved.</p>}
          <span className="hint">
            Shown in their column as &ldquo;Busy&rdquo;, without what it is called.
          </span>
        </div>
      </form>
    </details>
  );
}
