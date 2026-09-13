"use client";

import { useActionState } from "react";
import { setTravelBuffer, type FormState } from "../actions";
import { Field, SubmitButton } from "@/components/Form";

/**
 * How long this person needs between jobs.
 *
 * The business has one travelling time, padded either side of every job so two
 * cannot be booked back to back across a city. That is one number for a firm
 * with somebody in a van and somebody on a bike, and it is wrong for at least
 * one of them — the van driver is late all week, or the cyclist has an hour of
 * dead diary between every job nobody can fill.
 *
 * Blank means the business's, which is what nearly everybody stays on. Zero is
 * a different answer and a real one, so the copy says so: somebody working out
 * of one building needs no gap at all.
 *
 * Only shown where the business actually travels. On a salon's settings this
 * would be a box about driving between jobs nobody does.
 */
export function MyTravel({
  mine,
  business,
  firstName,
}: {
  /** This person's own, in minutes. Null means the business's. */
  mine: number | null;
  business: number;
  firstName: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(setTravelBuffer, {});

  return (
    <form action={action} className="card p-5">
      <div className="section-title">Getting between jobs</div>

      <p className="hint mt-1.5 max-w-prose">
        Left either side of every job so two are never booked back to back across town.
        The business allows {business} minutes; leave this blank to use that.
      </p>

      <div className="mt-4">
        <Field
          label={`${firstName}'s own, in minutes`}
          hint="Blank uses the business's. Zero is a real answer — it means no gap is needed at all."
        >
          <input
            name="travel_buffer_minutes"
            type="number"
            min={0}
            max={240}
            step={5}
            defaultValue={mine ?? ""}
            placeholder={String(business)}
            className="input w-32"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <SubmitButton />
        {state.error && <p className="text-sm text-warn">{state.error}</p>}
        {state.ok && <p className="text-sm text-ok">Saved.</p>}
      </div>
    </form>
  );
}
