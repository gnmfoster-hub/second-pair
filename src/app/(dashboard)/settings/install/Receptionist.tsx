"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setReceptionist } from "../actions";
import { VOICES, GREETING_LIMIT, greetingFor } from "@/lib/voice/howItSounds";

/**
 * The Receptionist, which is not the voicemail response above it.
 *
 * Giles asked which of the two the calls screen was about, and the screen
 * could not tell him — one word, "voice", was doing for both. They are
 * different products with different prices:
 *
 *   Voicemail response  Their own mobile rings first. What is missed is texted
 *                       back within seconds, or the caller leaves a message,
 *                       which is written down, answered by text with a real
 *                       time or price, and the recording deleted once read.
 *                       Nobody talks to a machine. Priced by the call.
 *
 *   Receptionist        The line picks up and holds the conversation. Priced
 *                       for each line that has one, because a line costs
 *                       whether it is rung or not.
 *
 * Shown to businesses that have not been sold it as well, saying what it is
 * and to ask — it is for sale, and a feature you cannot see is a feature
 * nobody buys. No price on the screen: Giles quotes it per business, and a
 * figure here would be out of date the first time he does.
 */
export function Receptionist({
  allowed,
  on,
  people,
  holds = true,
  asksDeposit = false,
  greeting = null,
  voice = null,
  businessName = null,
}: {
  /** Whether it has been sold to this business. Ours to set, never theirs. */
  allowed: boolean;
  /** Whether the business's own line has one. */
  on: boolean;
  /** Who else has one, by name, so the page says what is being paid for. */
  people: string[];
  /** A phone booking waits for a person. On by default. */
  holds?: boolean;
  /** It may text a deposit link after the call. Off by default. */
  asksDeposit?: boolean;
  /** The first thing it says. Null uses the business's name. */
  greeting?: string | null;
  /** Which voice speaks. Null is the house default. */
  voice?: string | null;
  businessName?: string | null;
}) {
  const [state, action] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    setReceptionist,
    {},
  );

  if (!allowed) {
    return (
      <section className="card p-5">
        <h2 className="section-title">Receptionist</h2>
        <p className="hint mt-1.5 max-w-prose">
          A line that picks up and talks, rather than texting back. It takes the call,
          answers what they ask and books them in while they are still on the phone.
        </p>
        <div className="mt-3 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
          <div className="label">Not on this plan</div>
          <p className="hint mt-1 max-w-prose">
            Separate from answering calls, which you may already have: that one rings your
            phone first and texts back what you miss. Ask us if you want a line that
            speaks. It is charged for each line that has one, so it is priced on its own.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="section-title">Receptionist</h2>
      <p className="hint mt-1.5 max-w-prose">
        A line that picks up and talks. Separate from the voicemail response above, which
        rings your phone first and texts back what you miss.
      </p>

      <form action={action} className="mt-4 space-y-3">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="receptionist_on"
            defaultChecked={on}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            On for the business&rsquo;s own line
            <span className="hint block">
              Anybody ringing the shop number gets it. Each person can have one of their
              own as well, and each is charged separately.
            </span>
          </span>
        </label>

        {/*
          * How it opens, and how it sounds.
          *
          * Giles, after hearing it answer for the first time: "there would
          * need to be some added tailoring from the businesses." These two,
          * and no more — tone of voice, house rules and never-say are already
          * theirs on the Assistant page and already reach the phone, because
          * it is the same assistant answering.
          */}
        <div className="space-y-3 border-t border-border pt-3">
          <label className="block text-sm">
            <span className="label">The first thing it says</span>
            <input
              name="receptionist_greeting"
              defaultValue={greeting ?? ""}
              maxLength={GREETING_LIMIT}
              placeholder={greetingFor(null, businessName)}
              className="input"
            />
            <span className="hint">
              Leave it empty and it opens with your name, as above. Keep it short: this is
              the one sentence somebody judges before deciding whether to carry on, and a
              paragraph is the thing callers talk over.
            </span>
          </label>

          <label className="block text-sm">
            <span className="label">Whose voice</span>
            <select name="receptionist_voice" defaultValue={voice ?? ""} className="input max-w-xs">
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {v.what}
                </option>
              ))}
            </select>
            <span className="hint">All British. Worth ringing your own number to hear it.</span>
          </label>
        </div>

        {/*
          * What it may do once it is answering.
          *
          * Giles: "can it book but have a confirm setting for deposits and
          * making sure its all ok." Two questions, because they are two
          * different risks — hearing a name wrong puts a stranger in the
          * diary, and asking for money is the only thing on the call that
          * reaches into somebody's bank account.
          */}
        <div className="space-y-3 border-t border-border pt-3">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="receptionist_holds"
              defaultChecked={holds}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Hold what it books until you have seen it
              <span className="hint block">
                The slot is taken straight away, so nobody else can have it, and it sits in
                the diary with a clock on it until you confirm. Worth keeping on: over the
                phone it is hearing a name or a time wrong that causes trouble, and that
                cannot happen over text.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="receptionist_asks_deposit"
              defaultChecked={asksDeposit}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Let it text a deposit link after the call
              <span className="hint block">
                Only once bookings are landing confirmed. Asking somebody for money for an
                appointment nobody has checked is the wrong way round, so this does nothing
                while the setting above is on.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Save />
          {state.error && <p className="text-sm text-bad">{state.error}</p>}
          {state.ok && <p className="text-sm text-ok">Saved.</p>}
        </div>
      </form>

      {/*
        * What is actually being paid for, said back.
        *
        * Charged per line, so the number of lines is the number on the
        * invoice. A business that has switched three on and remembers two is
        * the support call this sentence prevents.
        */}
      <p className="hint mt-4 max-w-prose">
        {people.length === 0 && !on
          ? "Nothing switched on yet, so nothing is being charged for it."
          : `Switched on for ${[...(on ? ["the business’s own line"] : []), ...people].join(", ")}. Each one is charged for.`}
      </p>
    </section>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn bg-accent text-on-accent" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
