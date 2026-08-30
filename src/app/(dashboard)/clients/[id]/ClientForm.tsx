"use client";

import { useActionState } from "react";
import { saveClient, type ClientState } from "./actions";
import { Field, SubmitButton } from "@/components/Form";

export function ClientForm({
  client,
}: {
  client: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    alert: string | null;
    marketing_consent: boolean;
  };
}) {
  const [state, action] = useActionState<ClientState, FormData>(saveClient, {});

  return (
    <form action={action} className="card space-y-5 p-5">
      <input type="hidden" name="id" value={client.id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <input name="name" defaultValue={client.name ?? ""} className="input" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={client.phone ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={client.email ?? ""} className="input" />
        </Field>
      </div>

      <Field
        label="Alert"
        hint="Shown wherever they appear. For anything that must not be missed — an allergy, a warning, a debt."
      >
        <input
          name="alert"
          defaultValue={client.alert ?? ""}
          placeholder="Latex allergy"
          className="input"
        />
      </Field>

      <Field label="Notes" hint="Only your team sees these.">
        <textarea name="notes" defaultValue={client.notes ?? ""} rows={4} className="input" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="marketing_consent"
          defaultChecked={client.marketing_consent}
          className="accent-[var(--accent)]"
        />
        Happy to receive marketing
      </label>
      <p className="hint">
        Off unless they have actually agreed. Required under UK GDPR, and kept separate from
        booking messages — reminders are sent regardless.
      </p>

      <div className="flex items-center gap-4">
        <SubmitButton />
        {state.error && <p className="text-sm text-accent">{state.error}</p>}
        {state.ok && <p className="text-sm text-ok">Saved.</p>}
      </div>
    </form>
  );
}
