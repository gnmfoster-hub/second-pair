"use client";

import { useActionState } from "react";
import { resetCalendarLink, type FormState } from "../actions";
import { Snippet } from "../install/Snippet";

/**
 * The diary, as a calendar to subscribe to — and the way to take that back.
 *
 * The feed itself has worked for weeks and no screen ever showed anybody the
 * address, so nothing could subscribe to it. Worse, the link is the entire
 * credential: a calendar app cannot sign in, so anybody holding the address
 * sees a year of the diary. It gets pasted into a phone, forwarded to whoever
 * is setting it up, and outlives its usefulness in somebody's shared calendar.
 *
 * Which is why resetting sits next to it rather than three screens away. It is
 * the only way to revoke one, and until now the product could not do it at
 * all.
 */
export function CalendarLinks({
  origin,
  business,
  mine,
  owns,
}: {
  origin: string;
  /** The whole diary. Owner only — it is everybody's work. */
  business: { name: string; token: string } | null;
  /** The person signed in, if they are one of the people in the business. */
  mine: { id: string; name: string; token: string } | null;
  owns: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(resetCalendarLink, {});

  if (!business && !mine) return null;

  return (
    <div className="card mt-8 space-y-5 p-5">
      <div>
        <h2 className="section-title">Your diary in your own calendar</h2>
        <p className="hint mt-1 max-w-prose">
          Add one of these to Google, Apple or Outlook and your appointments appear
          alongside everything else in your life. It updates on its own, and it is
          read-only &mdash; changing something in your calendar app will not move it
          here.
        </p>
      </div>

      {mine && (
        <div>
          <Snippet value={`${origin}/api/calendar/${mine.token}.ics`} label={`${mine.name.split(" ")[0]}’s own diary`} />
          <form action={action} className="mt-2 flex flex-wrap items-center gap-3">
            <input type="hidden" name="whose" value="mine" />
            <input type="hidden" name="artist_id" value={mine.id} />
            <button type="submit" className="btn-ghost text-sm">
              Reset this link
            </button>
            <span className="hint">Anything already subscribed stops updating.</span>
          </form>
        </div>
      )}

      {business && owns && (
        <div className={mine ? "border-t border-border pt-5" : ""}>
          <Snippet
            value={`${origin}/api/calendar/${business.token}.ics`}
            label={`Everybody at ${business.name}`}
          />
          <form action={action} className="mt-2 flex flex-wrap items-center gap-3">
            <input type="hidden" name="whose" value="studio" />
            <button type="submit" className="btn-ghost text-sm">
              Reset this link
            </button>
            <span className="hint">Anything already subscribed stops updating.</span>
          </form>
        </div>
      )}

      {/*
        * Said plainly, because the address is the whole of the security.
        *
        * Somebody deciding whether to paste this into a shared family calendar
        * ought to know what is in it before they do, not afterwards.
        */}
      <p className="hint border-t border-border pt-4">
        <strong>Treat the address like a password.</strong> Anyone who has it can see a
        year of the diary, including who is booked, their phone number and any note on
        the appointment &mdash; no sign-in needed, because a calendar app cannot sign in.
        If one gets out, reset it here and give people the new one.
      </p>

      {state.ok && <p className="text-sm text-ok">Done — the old link has stopped working.</p>}
      {state.error && <p className="text-sm text-warn">{state.error}</p>}
    </div>
  );
}
