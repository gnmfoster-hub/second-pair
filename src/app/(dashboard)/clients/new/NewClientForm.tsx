"use client";

import { useActionState } from "react";
import { addClient, type NewClientState } from "../actions";
import { Field, SubmitButton } from "@/components/Form";

export function NewClientForm() {
  const [state, action] = useActionState<NewClientState, FormData>(addClient, {});

  return (
    <form action={action} className="card space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <input name="name" className="input" autoFocus />
        </Field>
        <Field
          label="Mobile"
          hint="The only way to message somebody who has not written to you first."
        >
          <input name="phone" type="tel" inputMode="tel" className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" className="input" />
        </Field>
      </div>

      <Field
        label="Alert"
        hint="Shown wherever they appear. For anything that must not be missed."
      >
        <input name="alert" placeholder="Latex allergy" className="input" />
      </Field>

      <Field label="Notes" hint="Only your team sees these.">
        <textarea name="notes" rows={3} className="input" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="marketing_consent" className="accent-[var(--accent)]" />
        Happy to receive marketing
      </label>
      <p className="hint">
        Off unless they have actually said so. Reminders about their own booking are
        sent regardless — this is only for anything else.
      </p>

      <div className="flex items-center gap-4">
        <SubmitButton className="btn-highlight" pending="Adding…">
          Add client
        </SubmitButton>
        {state.error && <p className="text-sm text-bad">{state.error}</p>}
      </div>
    </form>
  );
}
