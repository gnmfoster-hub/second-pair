"use client";

import { useActionState, useState } from "react";
import { updateAssistant, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { verticalPack } from "@/lib/verticals";
import { Notifications } from "@/components/Notifications";
import type { Studio } from "@/lib/types";

/**
 * Teaching the assistant how this business works.
 *
 * Tone of voice describes a manner, which only gets you so far. The examples
 * at the bottom are the strongest thing on this page: one real question and
 * the reply the owner would have typed teaches length, warmth and vocabulary
 * in a way "be friendly and professional" never does.
 */
export function AssistantForm({ studio }: { studio: Studio }) {
  const [state, action] = useActionState<FormState, FormData>(
    updateAssistant,
    {},
  );
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };

  const [examples, setExamples] = useState<{ ask: string; reply: string }[]>(
    studio.voice_examples?.length
      ? studio.voice_examples
      : [{ ask: "", reply: "" }],
  );

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-8">
        <section className="card space-y-5 p-6">
          <div>
            <h2 className="section-title">Your voice</h2>
            <p className="hint mt-1">
              How the assistant sounds. Be specific — &ldquo;friendly and
              professional&rdquo; describes every business on earth.
            </p>
          </div>

          <Field
            label="Tone of voice"
            hint="How you greet people, how formal you are, anything you always or never say."
          >
            <textarea
              name="tone"
              defaultValue={studio.tone}
              rows={3}
              className="input"
              placeholder="Warm and chatty, first names, never pushy. We say 'lovely' a lot."
            />
          </Field>
        </section>

        <section className="card space-y-5 p-6">
          <div>
            <h2 className="section-title">House rules</h2>
            <p className="hint mt-1">
              One per line. These go straight into the assistant&rsquo;s
              instructions. It cannot use them to break a safety rule — it will
              still never quote under your minimum, never claim to be human, and
              never book someone underage.
            </p>
          </div>

          <Field
            label="Always work in, when it's relevant"
            hint="Facts worth mentioning at the right moment. It won't recite them at people."
          >
            <textarea
              name="always_mention"
              defaultValue={(studio.always_mention ?? []).join("\n")}
              rows={4}
              className="input"
              placeholder={
                "Parking is free after 6pm\nWe're on the first floor, there's a lift\nWe can do evenings if asked"
              }
            />
          </Field>

          <Field label="Never say" hint="Hard don'ts, in your words.">
            <textarea
              name="never_mention"
              defaultValue={(studio.never_mention ?? []).join("\n")}
              rows={4}
              className="input"
              placeholder={
                "Never say we do walk-ins\nNever promise a same-day appointment\nNever compare us to anyone else"
              }
            />
          </Field>

          <Field
            label="Always come and get me for"
            hint={`On top of complaints, anything medical, under-18s, and anyone who asks for a person — the assistant already fetches you for those.`}
          >
            <textarea
              name="escalate_when"
              defaultValue={(studio.escalate_when ?? []).join("\n")}
              rows={3}
              className="input"
              placeholder={
                "Anything to do with weddings\nAnyone asking about a refund\nJobs over £2,000"
              }
            />
          </Field>
        </section>

        <section className="card space-y-5 p-6">
          <div>
            <h2 className="section-title">Show it how you write</h2>
            <p className="hint mt-1">
              The most useful thing on this page. Put in a question you actually
              get, and the reply you would have typed yourself. Two or three is
              plenty — the assistant picks up your length and your words from
              them, and does not copy them as scripts.
            </p>
          </div>

          <div className="space-y-4">
            {examples.map((example, i) => (
              <div key={i} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="label mb-0">Example {i + 1}</span>
                  {examples.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExamples(examples.filter((_, j) => j !== i))
                      }
                      className="hint hover:text-bad"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <input
                  name="example_ask"
                  defaultValue={example.ask}
                  className="input"
                  placeholder={`Someone asks: how much for a ${words.service}?`}
                  maxLength={300}
                />
                <textarea
                  name="example_reply"
                  defaultValue={example.reply}
                  rows={3}
                  className="input mt-2"
                  placeholder="You answer: …in your own words, exactly as you'd type it"
                  maxLength={1000}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setExamples([...examples, { ask: "", reply: "" }])}
            className="btn-ghost"
          >
            Add another
          </button>
        </section>

        <div className="flex items-center gap-4">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>

      <Notifications />
    </div>
  );
}
