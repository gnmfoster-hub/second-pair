"use client";

import { useActionState } from "react";
import { saveSmsNumber } from "../actions";
import { Field, SubmitButton } from "@/components/Form";

/**
 * The number this business texts from, and receives on.
 *
 * Both halves matter and they fail differently, so the panel says which one is
 * missing. No number and nothing can be received — a reply arrives with no way
 * of telling whose customer it is. No keys and nothing can be sent, however
 * many numbers are registered.
 */
export function TextNumber({
  number,
  forwardTo,
  sendingReady,
  webhookUrl,
  voiceWebhookUrl,
}: {
  number: string | null;
  /** Where a call to it rings first. Null texts the caller straight away. */
  forwardTo: string | null;
  /** The account keys are in the environment. Nothing sends without them. */
  sendingReady: boolean;
  /** What to paste into Twilio so replies come back here. */
  webhookUrl: string;
  /** And so a call that nobody answers becomes a text rather than nothing. */
  voiceWebhookUrl: string;
}) {
  const [state, action] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    saveSmsNumber,
    {},
  );

  const live = Boolean(number) && sendingReady;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Text messages</div>
          <p className="hint mt-1 max-w-prose">
            The only channel that reaches somebody who hasn&rsquo;t written to you first.
            Reminders, and offering a cancelled slot, both need this.
          </p>
        </div>
        <span
          className={`pill shrink-0 ${live ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted"}`}
        >
          {live ? "Live" : "Not set up"}
        </span>
      </div>

      <form action={action} className="mt-5 space-y-4">
        <Field
          label="Your number"
          hint="In full international form. A UK mobile looks like +447700900123."
        >
          <input
            name="sms_number"
            defaultValue={number ?? ""}
            placeholder="+447700900123"
            className="input max-w-xs font-mono"
            inputMode="tel"
          />
        </Field>

        {/*
          * Missed calls, which is the same number wearing its other hat.
          *
          * Kept on this panel rather than given its own, because it is one
          * phone number and splitting it into "texts" and "calls" invites
          * somebody to set up half of it.
          */}
        <Field
          label="When somebody rings it, ring me on"
          hint="Your own mobile — customers never see it. Leave empty and a missed call is texted back straight away, without your phone going at all."
        >
          <input
            name="forward_to"
            defaultValue={forwardTo ?? ""}
            placeholder="+447700900123"
            className="input max-w-xs font-mono"
            inputMode="tel"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton />
          {state.error && <p className="text-sm text-bad">{state.error}</p>}
          {state.ok && <p className="text-sm text-ok">Saved.</p>}
        </div>
      </form>

      {/* The half that is missing, named. */}
      {!sendingReady && (
        <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
          Sending is not switched on yet — the Twilio keys are not in the
          environment. A number saved here will receive nothing until they are.
        </p>
      )}

      {number && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="hint">
            In Twilio, open this number and set <strong>A message comes in</strong> to a
            webhook POSTing to:
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg border border-border bg-surface-2/60 px-3 py-2 font-mono text-[11px]">
            {webhookUrl}
          </code>
          <p className="hint mt-2">
            Without it, texts arrive at Twilio and go nowhere. Replies are checked
            against Twilio&rsquo;s signature, so nobody else can post to it.
          </p>

          <p className="hint mt-4">
            On the same page, set <strong>A call comes in</strong> to a webhook POSTing
            to:
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg border border-border bg-surface-2/60 px-3 py-2 font-mono text-[11px]">
            {voiceWebhookUrl}
          </code>
          <p className="hint mt-2">
            That is what turns a missed call into a text. The caller gets one from this
            same number, so whatever they write back arrives as an ordinary message and
            is answered like any other &mdash; and their number is on file either way,
            which is the one thing a missed call in a phone log never gives you.
          </p>
        </div>
      )}
    </div>
  );
}
