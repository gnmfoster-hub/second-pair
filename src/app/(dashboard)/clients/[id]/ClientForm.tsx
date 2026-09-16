"use client";

import { useActionState } from "react";
import { saveClient, type ClientState } from "./actions";
import { Field, SubmitButton } from "@/components/Form";
import { describeConsent } from "@/lib/consent";
import { CopyLink } from "@/components/CopyLink";

export function ClientForm({
  client,
  prefsUrl,
}: {
  /** Their own preferences page, where the database has a token for it. */
  prefsUrl?: string | null;
  client: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    alert: string | null;
    marketing_consent: boolean;
    marketing_email?: boolean | null;
    marketing_sms?: boolean | null;
    marketing_consent_at?: string | null;
    marketing_consent_source?: string | null;
  };
}) {
  const [state, action] = useActionState<ClientState, FormData>(saveClient, {});

  const consent = describeConsent(client);

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

      {/*
        * Per channel, because the rules are per channel.
        *
        * Agreeing to an email about an offer is not agreeing to a text on a
        * Sunday, and one tick covering both is what makes a list unusable the
        * day somebody wants to use it.
        */}
      <fieldset>
        <legend className="label">Marketing</legend>

        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="marketing_email"
            defaultChecked={client.marketing_email ?? client.marketing_consent}
            className="accent-[var(--accent)]"
          />
          Happy to be emailed offers and news
        </label>

        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="marketing_sms"
            defaultChecked={client.marketing_sms ?? false}
            className="accent-[var(--accent)]"
          />
          Happy to be texted offers and news
        </label>
      </fieldset>
      {/*
        * What is actually recorded, rather than what the tick implies.
        *
        * Three states, and a checkbox shows two of them. A tick nobody can date
        * is the third, and it is what every tick made before this existed looks
        * like — saying so is what stops somebody relying on it the day they
        * want to send something.
        */}
      <p className={`hint ${consent.evidenced ? "" : "text-warn"}`}>{consent.text}</p>

      <p className="hint">
        Off unless they have actually agreed. Required under UK GDPR, and kept separate from
        booking messages &mdash; reminders are sent regardless. When it was agreed is
        recorded, because a tick on its own is not evidence of anything.
      </p>

      {/*
        * Their own link, which is the half that makes this lawful rather than
        * merely recorded: consent has to be as easy to withdraw as it was to
        * give, and "ring us and ask" is not that.
        */}
      {prefsUrl && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <div className="font-medium">Their own preferences page</div>
          <p className="hint mt-1">
            Send them this and they set it themselves, without asking you. The link keeps
            working, so it belongs at the bottom of anything you send them.
          </p>
          <CopyLink url={prefsUrl} />
        </div>
      )}

      <div className="flex items-center gap-4">
        <SubmitButton />
        {state.error && <p className="text-sm text-bad">{state.error}</p>}
        {state.ok && <p className="text-sm text-ok">Saved.</p>}
      </div>
    </form>
  );
}
