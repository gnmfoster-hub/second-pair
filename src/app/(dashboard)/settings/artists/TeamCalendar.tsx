"use client";

import { useActionState } from "react";
import { resetCalendarLink, type FormState } from "../actions";
import { Snippet } from "../install/Snippet";

/**
 * One person's diary, as a link the owner can hand them.
 *
 * Everybody in the diary has had a calendar feed of their own since the
 * feature was built, and only one person could ever see it: the one signed in.
 * Which in a salon is the owner, and almost nobody else — a stylist does not
 * need a login to cut hair, so most of them never had one, and their own
 * appointments in their own phone were unreachable.
 *
 * The owner could always reset these; the action has said so in a comment
 * since it was written. There was simply no screen that offered it.
 *
 * The link is the whole credential — a calendar app cannot sign in — so
 * resetting sits beside it rather than three screens away, and the warning
 * about what resetting costs is next to the button that does it.
 */
export function TeamCalendar({
  origin,
  artistId,
  name,
  token,
}: {
  origin: string;
  artistId: string;
  name: string;
  token: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(resetCalendarLink, {});
  const first = name.split(" ")[0];

  return (
    <details className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        {first}&rsquo;s diary in their own calendar
      </summary>

      <div className="mt-3">
        <p className="hint max-w-prose">
          Send {first} this and their appointments appear in Google, Apple or Outlook
          beside everything else in their life. It updates on its own and is read-only, so
          nothing they do in their calendar can move a booking here.
        </p>

        <div className="mt-3">
          <Snippet value={`${origin}/api/calendar/${token}.ics`} label={`${first}’s diary`} />
        </div>

        <form action={action} className="mt-2 flex flex-wrap items-center gap-3">
          <input type="hidden" name="whose" value="mine" />
          <input type="hidden" name="artist_id" value={artistId} />
          <button type="submit" className="btn-ghost text-sm">
            Reset this link
          </button>
          <span className="hint">
            Anybody already subscribed stops updating &mdash; including {first}.
          </span>
        </form>

        {state.error && <p className="mt-2 text-sm text-warn">{state.error}</p>}
      </div>
    </details>
  );
}
