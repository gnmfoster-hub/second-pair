"use client";

import { useActionState } from "react";
import { saveCallForwarding } from "../actions";
import { Field, SubmitButton } from "@/components/Form";
import { readableNumber } from "@/lib/channels/phoneNumbers";

/**
 * The number this business texts from, and receives on.
 *
 * Everything about how that number exists — who it is bought from, what it is
 * wired to, which keys make it send — is Second Pair's plumbing, and it used to
 * be printed on this page: the supplier by name, two webhook addresses to paste
 * into somebody else's console, and a box inviting a business to type a number
 * nobody had given them.
 *
 * None of that was theirs to do, and one of them was dangerous: the number
 * arrived as a form field, so a submission without it saved a blank and took
 * the business off texts and missed calls without a word.
 *
 * What is left is what a business actually decides — whether their own phone
 * rings first, and how they keep their old number alongside this one. The rest
 * is set up for them before they ever see this screen.
 */
export function TextNumber({
  number,
  forwardTo,
  sendingReady,
}: {
  number: string | null;
  /** Where a call to it rings first. Null texts the caller straight away. */
  forwardTo: string | null;
  /** Whether the platform can send at all. Nothing they can do about it. */
  sendingReady: boolean;
}) {
  const [state, action] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    saveCallForwarding,
    {},
  );

  const live = Boolean(number) && sendingReady;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Text messages and missed calls</div>
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

      {number ? (
        <div className="mt-5 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
          <div className="label">Your number</div>
          <div className="mt-0.5 font-mono text-lg tabular-nums">
            {readableNumber(number)}
          </div>
          <p className="hint mt-1.5 max-w-prose">
            Put this on your website, your Google listing and anything printed from now
            on. Texts to it are answered day and night, and anybody who rings and
            doesn&rsquo;t get through is texted back within seconds.
          </p>
        </div>
      ) : (
        /*
         * Not a form. A business does not buy its own number — it is bought,
         * registered and wired up for them — so an empty box here would only
         * offer somebody the chance to type a number that receives nothing.
         */
        <div className="mt-5 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
          <div className="label">No number yet</div>
          <p className="hint mt-1 max-w-prose">
            Ask us and we will set one up. It takes a few days, because a UK number has
            to be registered to a real address before it can send anything &mdash; and
            then texts and missed calls simply start working.
          </p>
        </div>
      )}

      {number && (
        <form action={action} className="mt-5 space-y-4">
          <Field
            label="When somebody rings it, ring me on"
            hint="Your own mobile — customers never see it. Leave it empty and a missed call is texted back straight away, without your phone going at all."
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
      )}

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
            <div className="label">1. Give out the new number as well</div>
            <p className="mt-1">
              Put the number above on your website, your Google listing, your Instagram
              and your booking buttons, and leave your mobile for the people who already
              have it. Set &ldquo;ring me on&rdquo; to your mobile and a call to the new
              number rings you first anyway &mdash; so nothing is lost, and anybody
              arriving from the website lands somewhere the assistant can answer at
              eleven at night.
            </p>
          </div>

          <div>
            <div className="label">
              2. Keep your number, and divert calls you don&rsquo;t answer
            </div>
            <p className="mt-1">
              Your network can divert a call to another number <em>only</em> when you do
              not pick up, are engaged, or have no signal. Point that at the number
              above. Customers carry on ringing you exactly as they do now, your phone
              rings normally, and the ones you miss come here and get texted back within
              seconds &mdash; from a number that can hold the conversation afterwards.
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
              them until it gives up. Empty means we text the caller the moment they
              reach us, which is what you want here anyway &mdash; your phone has already
              had its fifteen seconds.
            </p>
          </div>

          <div>
            <div className="label">What neither route can do</div>
            <p className="mt-1">
              A <em>text</em> sent to your own mobile cannot reach the assistant. Calls
              can be diverted; texts cannot, on any UK network. So texts only work on the
              number above. In practice that matters less than it sounds, because the
              missed-call reply comes from that number &mdash; so the moment somebody
              rings you and you cannot answer, the conversation moves there on its own.
            </p>
          </div>

          <div>
            <div className="label">One thing to check on your own phone</div>
            <p className="mt-1">
              Voicemail is the real competition. If it answers before we do, the caller
              leaves a message that mostly never gets played back, and no text is ever
              sent &mdash; as far as the line is concerned, somebody answered. Turn it
              off, or push the answer delay out to thirty seconds.
            </p>
          </div>
        </div>
      </details>

      {/*
        * The platform half being down is ours, not theirs. Said plainly enough
        * that they know nothing is going out, and without naming plumbing they
        * cannot do anything about.
        */}
      {number && !sendingReady && (
        <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
          Sending is not switched on yet at our end, so nothing will go out from this
          number until it is. Tell us and we will sort it.
        </p>
      )}
    </div>
  );
}
