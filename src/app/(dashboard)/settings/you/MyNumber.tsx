"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveMyForwarding } from "../actions";
import type { FormState } from "../actions";
import { readableNumber } from "@/lib/channels/phoneNumbers";

/**
 * Where her own line rings before it becomes a text.
 *
 * The business's number has had this from the start, on the Install page, and
 * it belongs to the owner. A person with a line of her own had nowhere to say
 * the same thing, so her number rang nothing and every caller was texted back.
 * That is a real choice and plenty of people want it, but it was not hers: it
 * was made for her by there being no box.
 *
 * Empty is that choice, said out loud. Somebody with their hands in somebody
 * else's hair all day would rather the phone did not go at all, and the caller
 * gets a text within seconds either way.
 */
export function MyNumber({
  number,
  forwardTo,
  firstName,
}: {
  /** Her own line. This panel is not rendered without one. */
  number: string;
  /** Where it rings now, or null for nowhere. */
  forwardTo: string | null;
  firstName: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveMyForwarding, {});

  return (
    <form action={action} className="mt-2.5 space-y-2.5">
      <label className="block">
        <span className="label">When somebody rings it, ring me on</span>
        <input
          name="forward_to"
          defaultValue={forwardTo ?? ""}
          placeholder="+447700900123"
          className="input mt-1 max-w-xs font-mono"
          inputMode="tel"
        />
      </label>

      <p className="hint">
        Your own mobile. Customers never see it, and it is only ever rung by a call to{" "}
        <span className="num">{readableNumber(number)}</span>. Leave it empty and your phone
        does not go at all: whoever rang is texted back within seconds and {firstName} picks
        it up when there is a minute.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Save />
        {state.error && <p className="text-sm text-bad">{state.error}</p>}
        {state.ok && <p className="text-sm text-ok">Saved.</p>}
      </div>

      {/*
        * What is actually stored, said back.
        *
        * The box holds whatever was last typed into it, saved or not, so on its
        * own it cannot answer "did that go in" — and whether your phone rings is
        * not a thing to discover by missing a call. Same reason the business's
        * own panel grew this line.
        */}
      <p className="hint">
        {forwardTo ? (
          <>
            Right now a call rings <span className="num">{readableNumber(forwardTo)}</span> for
            fifteen seconds first, then the caller gets a text.
          </>
        ) : (
          "Right now nobody is rung, and a missed call is texted back straight away."
        )}
      </p>
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
