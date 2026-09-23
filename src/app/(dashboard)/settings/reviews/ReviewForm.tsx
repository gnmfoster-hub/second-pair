"use client";

import { useActionState, useState } from "react";
import { saveReviews } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import type { FormState } from "../actions";
import { HowItLands } from "@/components/HowItLands";
import { fillReview, reviewMessage, REVIEW_TOKENS } from "@/lib/reviews";

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
  business,
  message,
  look,
}: {
  url: string;
  on: boolean;
  /** What this trade calls the people it serves. */
  words: string;
  business: string;
  /** Their own wording. Null means they have never written one. */
  message: string | null;
  look?: { photoUrl?: string | null; policy?: string | null };
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

  /*
   * Their wording, starting from ours.
   *
   * A business that has never opened this screen gets the built-in sentence,
   * and the box shows it rather than sitting empty — an empty box invites
   * somebody to write from nothing, and the thing most likely to happen then
   * is that they close the page and keep sending a sentence they never chose.
   */
  const [wording, setWording] = useState(
    message ??
      reviewMessage({
        firstName: "{{name}}",
        business: "{{business}}",
        what: "{{what}}",
        url: "{{link}}",
      }),
  );

  /* The same filler the sender uses, with stand-ins. */
  const shown = fillReview(wording, {
    firstName: "Marie",
    business,
    what: "colour",
    url: link.trim() || "https://g.page/r/your-link",
  });

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

      <Field
        label="What it says"
        explain={REVIEW_TOKENS.map((t) => `{{${t}}}`).join(", ")}
      >
        <textarea
          name="review_message"
          value={wording}
          onChange={(e) => setWording(e.target.value)}
          rows={3}
          className="input"
        />
      </Field>

      {/*
        * Both channels, rendered by the code that sends them.
        *
        * Every business sent the identical sentence until now, because the
        * wording was written into reviews.ts and only the link was theirs. It
        * read well for a salon and oddly for a plastering firm — and this is
        * the one message that asks a customer for a favour, which is where
        * sounding like the person who did the work matters most.
        */}
      <HowItLands
        text={shown}
        business={business}
        photoUrl={look?.photoUrl}
        policy={null}
      />

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
