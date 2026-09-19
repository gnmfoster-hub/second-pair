"use client";

import { useActionState } from "react";
import { setRemindersOwn, type FormState } from "../actions";
import { ReminderEditor } from "../reminders/ReminderEditor";
import type { ReminderTemplateRow, Sender } from "../reminders/ReminderEditor";

/**
 * Whose reminders this person's clients get.
 *
 * Reminder templates belong to the business, so every client of every person
 * gets the same message at the same hour. Some people want exactly that. A
 * mobile hairdresser reminding people the night before is not the same
 * business as a tattooist reminding them a week out about aftercare, and one
 * setting cannot be both.
 *
 * The footgun this is built around: switching to your own with none written
 * means your clients get nothing. That is the correct behaviour — falling back
 * to the shop's would mean somebody who turned this on to stop a message going
 * out would watch it go out anyway — but it is a terrible thing to discover
 * afterwards. So the switch says what will happen before it is pressed, and
 * the editor is on the same screen rather than somewhere else.
 */
export function MyReminders({
  on,
  mine,
  businessCount,
  firstName,
  sender,
}: {
  on: boolean;
  /** This person's own templates. Usually none. */
  mine: ReminderTemplateRow[];
  /** How many the business has, so the alternative is a number not a promise. */
  businessCount: number;
  firstName: string;
  /** Who these arrive from, shown under the preview. */
  sender: Sender;
}) {
  const [state, action] = useActionState<FormState, FormData>(setRemindersOwn, {});

  return (
    <section className="card p-5">
      <div className="section-title">Reminders to your clients</div>

      <p className="hint mt-1.5 max-w-prose">
        Sent before an appointment so people turn up. At the moment{" "}
        {on ? (
          <>you send your own.</>
        ) : businessCount > 0 ? (
          <>
            yours go out with everybody else&rsquo;s &mdash; the {businessCount} the
            business has set up.
          </>
        ) : (
          /* "the 0 the business has set up" was the sentence here. */
          <>
            <strong>your clients are sent nothing</strong> &mdash; the business has none
            set up, and you are on the business&rsquo;s.
          </>
        )}
      </p>

      <form action={action} className="mt-4">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="on"
            defaultChecked={on}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="mt-0.5"
          />
          <span>
            Send my own instead
            <span className="hint block">
              Only for {firstName}&rsquo;s clients. Everybody else carries on with the
              business&rsquo;s.
            </span>
          </span>
        </label>

        {state.error && <p className="mt-3 text-sm text-warn">{state.error}</p>}
      </form>

      {/*
       * The warning that matters, and only when it is true. Said after the
       * switch because that is the order somebody reads it in, and phrased as
       * what is happening now rather than what might.
       */}
      {/*
       * Turning the switch off is only a way out if there is something to fall
       * back to. It told people to use "the business's 0" — which is not a
       * fix, it is the same silence by another route, and it is the state the
       * salon was actually in.
       */}
      {on && mine.length === 0 && (
        <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          <strong>Your clients are getting no reminders at all.</strong> You have asked
          for your own and written none.{" "}
          {businessCount > 0 ? (
            <>
              Add one below, or turn the switch back off to use the business&rsquo;s{" "}
              {businessCount}.
            </>
          ) : (
            <>
              Add one below. Turning the switch off would not help — the business has
              none either, so nobody here is reminding anybody.
            </>
          )}
        </p>
      )}

      {on && (
        <div className="mt-4 space-y-3">
          {mine.map((r, i) => (
            <ReminderEditor key={r.id} reminder={r} index={i} mine sender={sender} />
          ))}
          <ReminderEditor index={mine.length} mine sender={sender} />
        </div>
      )}
    </section>
  );
}
