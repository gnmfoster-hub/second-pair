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

      {/*
        * Keeping the number their customers already have.
        *
        * The commonest and most reasonable objection to any of this: somebody
        * with a mobile number on their van, their card and four years of
        * customers' phones is not going to change it, and should not be asked
        * to. Both routes here keep it. Neither is obvious, and one of them has
        * a trap in it worth naming out loud.
        */}
      <details className="mt-5 rounded-xl border border-border p-4">
        <summary className="cursor-pointer text-sm">
          Can I keep the number my customers already ring?
        </summary>

        <div className="mt-3 space-y-4 text-sm text-muted">
          <p>
            <strong className="text-foreground">Yes, and you should.</strong> Nobody is
            asking you to change a number that is on your van and in four years of
            customers&rsquo; phones. There are two ways, and the right one depends on
            whether you want your own phone to ring first.
          </p>

          <div>
            <div className="label">
              1. Keep your number, and divert calls you don&rsquo;t answer
            </div>
            <p className="mt-1">
              Your network can divert a call to another number <em>only</em> when you do
              not pick up, are engaged, or have no signal. Point that at the number above.
              Customers carry on ringing you exactly as they do now, your phone rings
              normally, and the ones you miss come here and get texted back within seconds
              &mdash; from a number that can hold the conversation afterwards.
            </p>
            <p className="mt-1">
              On most UK networks it is a code dialled from the phone, or a setting in
              your network&rsquo;s app. Ask for{" "}
              <strong className="text-foreground">conditional call diversion</strong> or
              &ldquo;divert when unanswered&rdquo; &mdash; not the plain kind, which sends
              every call away and stops your phone ringing at all.
            </p>
            <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
              <strong>If you do this, leave &ldquo;ring me on&rdquo; empty above.</strong>{" "}
              Otherwise a missed call diverts to us, we ring your mobile, your mobile
              diverts it straight back, and the two numbers pass the same call between
              them until it gives up. Empty means we text the caller the moment they reach
              us, which is what you want here anyway &mdash; your phone has already had its
              twenty seconds.
            </p>
          </div>

          <div>
            <div className="label">2. Give out the new number as well</div>
            <p className="mt-1">
              Put the number above on your website, your Instagram and your booking
              buttons, and leave your mobile for people who already have it. Set
              &ldquo;ring me on&rdquo; to your mobile, and a call to the new number rings
              you first anyway &mdash; so nothing is lost, and anybody arriving from the
              website lands somewhere the assistant can answer at eleven at night.
            </p>
          </div>

          <div>
            <div className="label">What neither route can do</div>
            <p className="mt-1">
              A <em>text</em> sent to your own mobile cannot reach the assistant. Calls can
              be diverted; texts cannot, on any UK network. So texts only work on the
              number above. In practice that matters less than it sounds, because the
              missed-call reply comes from that number &mdash; so the moment somebody rings
              you and you cannot answer, the conversation moves there on its own.
            </p>
          </div>
        </div>
      </details>

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
