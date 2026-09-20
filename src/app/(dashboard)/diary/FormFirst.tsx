"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { sendForm, listFormTemplates, type FormActionState } from "../formActions";
import type { FormNeed } from "@/lib/forms/required";

/**
 * The form this appointment needs, on the appointment.
 *
 * Signed: a quiet tick and a link to read it. Sent but not signed: a warning
 * and a way to send it again. Never sent: a warning and one tap to send it the
 * way they can be reached — or to make the link and hand them the tablet.
 */
export function FormFirst({ need, contactId, bookingId }: { need: FormNeed; contactId: string; bookingId: string }) {
  const [state, action, pending] = useActionState<FormActionState, FormData>(sendForm, {});
  const [copied, setCopied] = useState(false);

  if (need.state === "signed") {
    return (
      <p className="mt-3 text-sm">
        <span className="pill bg-ok/10 text-ok">✓ {need.name} signed</span>{" "}
        {need.formId && (
          <Link href={`/clients/${contactId}/forms/${need.formId}`} className="text-accent hover:underline">
            Read it
          </Link>
        )}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm">
      <div className="font-medium text-warn">
        {need.state === "waiting" ? `${need.name} sent, not signed yet` : `${need.name} needed before this`}
      </div>

      {state.ok && (state.sent ?? 0) > 0 ? (
        <div className="mt-2 space-y-2">
          <p className="text-ok">{state.url ? "Link made." : "Sent."} It shows as signed here once they have done it.</p>
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
                Open it for them to sign here
              </a>
            </div>
          )}
        </div>
      ) : (
        <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="template_id" value={need.templateId} />
          <input type="hidden" name="contact_id" value={contactId} />
          <input type="hidden" name="booking_id" value={bookingId} />
          <button name="send_on" value="auto" disabled={pending} className="btn bg-accent text-sm text-on-accent disabled:opacity-60">
            {need.state === "waiting" ? "Send it again" : "Send it to them"}
          </button>
          <button name="send_on" value="" disabled={pending} className="btn border border-border text-sm">
            Make the link
          </button>
          {need.state === "waiting" && need.formId && (
            <Link href={`/clients/${contactId}/forms/${need.formId}`} className="text-accent hover:underline">
              See it
            </Link>
          )}
          {state.error && <span className="w-full text-warn">{state.error}</span>}
          {state.unreached && state.unreached.length > 0 && (
            <span className="w-full text-warn">It could not reach them. Make the link instead.</span>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * Any form, on any appointment, when somebody decides it is needed.
 *
 * Nothing asks for a form unless a service is set to — but a regular trying a
 * colour for the first time, or a child in for a first cut, is exactly when
 * somebody at the desk wants one sent anyway. The forms are only fetched when
 * the button is pressed, so an appointment costs nothing extra to open.
 */
export function SendAnyForm({ contactId, bookingId }: { contactId: string; bookingId: string }) {
  const [templates, setTemplates] = useState<{ id: string; name: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, action, pending] = useActionState<FormActionState, FormData>(sendForm, {});
  const [copied, setCopied] = useState(false);

  if (templates === null) {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setTemplates(await listFormTemplates().catch(() => []));
          setLoading(false);
        }}
        className="text-sm text-accent hover:underline"
      >
        {loading ? "…" : "Send a form"}
      </button>
    );
  }

  if (!templates.length) {
    return (
      <p className="hint text-sm">
        No forms yet —{" "}
        <Link href="/settings/forms" className="text-accent hover:underline">
          add one in Settings → Forms
        </Link>
        .
      </p>
    );
  }

  if (state.ok && (state.sent ?? 0) > 0) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-ok">{state.url ? "Link made." : "Sent."}</p>
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
              Open it for them to sign here
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <input type="hidden" name="contact_id" value={contactId} />
      <input type="hidden" name="booking_id" value={bookingId} />
      <select id={`any-form-${bookingId}`} name="template_id" className="input" defaultValue={templates[0].id}>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button name="send_on" value="auto" disabled={pending} className="btn bg-accent text-sm text-on-accent disabled:opacity-60">
          Send it to them
        </button>
        <button name="send_on" value="" disabled={pending} className="btn border border-border text-sm">
          Make the link
        </button>
        <button type="button" onClick={() => setTemplates(null)} className="text-sm text-muted hover:text-foreground">
          Cancel
        </button>
      </div>
      {state.error && <p className="text-warn">{state.error}</p>}
      {state.unreached && state.unreached.length > 0 && <p className="text-warn">It could not reach them. Make the link instead.</p>}
    </form>
  );
}
