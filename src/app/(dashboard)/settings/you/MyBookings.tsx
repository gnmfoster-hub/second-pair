"use client";

import { useActionState } from "react";
import { setNotifyOwnBookings, type FormState } from "../actions";
import type { Artist } from "@/lib/types";

/**
 * Whether this person is told about their own appointments.
 *
 * Every notification this product sent went to the business: one email address,
 * and every device anybody had registered against the shop. So a stylist who
 * turned notifications on was buzzed about everybody's work, and the one thing
 * she actually wanted — somebody has booked in with me — did not exist.
 *
 * On by default, because being told about your own appointments is the reason
 * a person turns notifications on at all. A default of off would mean every
 * member of staff has to find a setting before the feature does anything.
 *
 * Theirs. The owner cannot set it for them, and does not need to.
 */
export function MyBookings({
  artist,
  business = "business",
}: {
  artist: Artist;
  /** What the business is called in its trade: salon, studio, clinic. */
  business?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(setNotifyOwnBookings, {});
  const first = artist.name.split(" ")[0];

  return (
    <form action={action} className="card p-5">
      <div className="section-title">Your own appointments</div>

      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="on"
          defaultChecked={artist.notify_own_bookings !== false}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-0.5"
        />
        <span>
          Tell me when somebody books in with me
          <span className="hint block">
            Goes to {first}&rsquo;s own devices and {first}&rsquo;s own address, not
            the {business}&rsquo;s, and not anybody else&rsquo;s. You are not told about other
            people&rsquo;s bookings.
          </span>
        </span>
      </label>

      {/*
       * The thing that makes the switch above do nothing, said where it is
       * relevant. An address is how somebody with no login hears anything at
       * all, and most of a salon has no login.
       */}
      {!artist.email && (
        <p className="hint mt-3 rounded-lg bg-surface-2 px-3 py-2">
          There is no email address on your record, so this can only reach a device you
          have switched notifications on for. Whoever runs the business can add one.
        </p>
      )}

      {state.error && <p className="mt-3 text-sm text-warn">{state.error}</p>}
      {state.ok && <p className="mt-3 text-sm text-ok">Saved.</p>}
    </form>
  );
}
