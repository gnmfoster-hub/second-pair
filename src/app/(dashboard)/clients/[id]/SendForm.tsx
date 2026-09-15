"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { sendForm, type FormActionState } from "../../formActions";

/**
 * Send one of the business's forms to this person.
 *
 * Folded until asked for, like taking a payment: most visits to a record are
 * to read it. Then the form, and a button for each way they can actually be
 * reached — or just the link, for somebody standing at the desk who can fill
 * it in on the business's own tablet.
 */
export function SendForm({
  contactId,
  firstName,
  templates,
  channels,
  mayMessage,
  bookingId,
}: {
  contactId: string;
  firstName: string;
  templates: { id: string; name: string }[];
  channels: { channel: string; label: string }[];
  mayMessage: boolean;
  bookingId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormActionState, FormData>(sendForm, {});
  const [copied, setCopied] = useState(false);

  if (!templates.length) {
    return (
      <p className="hint text-sm">
        No forms yet.{" "}
        <Link href="/settings/forms" className="text-accent hover:underline">
          Add one
        </Link>{" "}
        — there are ready-made ones for your trade.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn w-full border border-border">
        Send a form
      </button>
    );
  }

  if (state.ok && (state.sent ?? 0) > 0) {
    return (
      <div className="space-y-2 rounded-xl bg-ok/5 p-3 text-sm">
        <p className="text-ok">
          {state.url && !channels.length ? "Link made." : `Sent to ${firstName}.`} It shows here as signed once they
          have done it.
        </p>
        {state.note && <p className="hint text-xs">{state.note}</p>}
        {state.url && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(state.url ?? "").then(() => setCopied(true))}
              className="btn border border-border text-sm"
            >
              {copied ? "Copied" : "Copy the link"}
            </button>
            <a href={state.url} target="_blank" rel="noreferrer" className="btn border border-border text-sm">
              Open it to fill in here
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-surface-2/40 p-3">
      <input type="hidden" name="contact_id" value={contactId} />
      {bookingId && <input type="hidden" name="booking_id" value={bookingId} />}
      <label className="block">
        <span className="label">Which form</span>
        <select id="send-form-template" name="template_id" className="input" required defaultValue={templates[0].id}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {mayMessage &&
          channels.map((c) => (
            <button
              key={c.channel}
              name="send_on"
              value={c.channel}
              disabled={pending}
              className="btn bg-accent text-sm text-on-accent disabled:opacity-60"
            >
              Send by {c.label.toLowerCase()}
            </button>
          ))}
        <button name="send_on" value="" disabled={pending} className="btn border border-border text-sm">
          Just make the link
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">
          Cancel
        </button>
      </div>

      {state.error && <p className="text-sm text-warn">{state.error}</p>}
      {state.unreached && state.unreached.length > 0 && (
        <p className="text-sm text-warn">
          It could not reach {firstName} that way. Try another, or make the link and give it to them.
        </p>
      )}
    </form>
  );
}
