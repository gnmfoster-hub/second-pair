"use client";

import { useActionState, useState } from "react";
import { saveReviews } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import type { FormState } from "../actions";

/**
 * Asking for a review: the cheapest marketing a small business has, and the
 * one nobody remembers to do.
 *
 * It lived on the business page among three dozen other fields, between the
 * privacy notice and the trade's key dates, which is why Giles could not find
 * it. It is a message sent to a customer, so it belongs with the others.
 */
export function ReviewForm({
  url,
  on,
  words,
}: {
  url: string;
  on: boolean;
  /** What this trade calls the people it serves. */
  words: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveReviews, {});

  /*
   * Controlled only so the switch can explain itself.
   *
   * Nothing is sent without a link, and a checkbox that silently refuses to
   * stay on is maddening — so it says why while the box above is empty
   * rather than letting somebody tick it and wonder.
   */
  const [link, setLink] = useState(url);

  return (
    <form action={action} className="card space-y-4 p-5">
      <Field
        label="Your review link"
        hint="In Google Business Profile, under Ask for reviews. Any review page works."
      >
        <input
          name="review_url"
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://g.page/r/your-google-review-link"
          className="input max-w-md"
        />
      </Field>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="review_ask"
          defaultChecked={on}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>
          Ask for a review after an appointment
          <span className="hint block">
            The morning after, once, on whichever channel they came in on. Never to somebody
            who has texted STOP, and never twice to the same person for the same visit.
          </span>
        </span>
      </label>

      {!link.trim() && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          Nothing is sent until there is a link above. A request with nowhere to send
          people is a message with a hole in it, so the switch stays off without one.
        </p>
      )}

      <p className="hint max-w-prose">
        This is not marketing and needs no permission: it is about an appointment your{" "}
        {words.toLowerCase()} just had. It is still only sent once.
      </p>

      <div className="flex items-center gap-4">
        <SubmitButton className="btn-ghost">Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
