"use client";

import { useActionState, useState } from "react";
import { updateAssistant, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { verticalPack } from "@/lib/verticals";
import { Notifications } from "@/components/Notifications";
import { TryIt } from "./TryIt";
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
        {/*
          * Who answers first, before anything about how it sounds.
          *
          * This is the setting people actually come here looking for — "can I
          * do my own messages when I'm about?" — and burying it under tone of
          * voice would send them hunting for an off switch instead. There is no
          * off switch, and the reason is written where they will read it.
          */}
        <section className="card space-y-5 p-6">
          <div>
            <h2 className="section-title">Who answers first</h2>
            <p className="hint mt-1">
              None of these turn the assistant off. A business that goes quiet is the
              thing this is here to prevent, and that never happens on purpose — it
              happens when somebody means to switch it back on and then has a busy
              afternoon.
            </p>
          </div>

          <div className="space-y-2.5">
            {[
              {
                value: "when_free",
                title: "Give me first refusal while I'm free",
                body:
                  "A message arrives, you're told, and you get a few minutes to answer it yourself. If you don't, the assistant does. When you're shut or with a client it just answers, because your hands are full.",
              },
              {
                value: "always_ask_me",
                title: "Give me first refusal on everything",
                body:
                  "The same, evenings and weekends included. For when you'd rather answer your own Sunday enquiries — it still steps in if you don't, so nothing is ever left.",
              },
              {
                value: "always",
                title: "Answer everything straight away",
                body:
                  "Nothing ever waits on you. You can still take over any conversation, and pressing “I've got this” still stands the assistant down for a while.",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="row flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors has-[:checked]:border-accent has-[:checked]:bg-surface-2/60"
              >
                <input
                  type="radio"
                  name="answering_mode"
                  value={option.value}
                  defaultChecked={(studio.answering_mode ?? "when_free") === option.value}
                  className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="hint mt-0.5 block">{option.body}</span>
                </span>
              </label>
            ))}
          </div>

          <Field
            label="How long a head start"
            hint="Minutes, on text and social messages only. Somebody on your website always gets an answer straight away — they are sitting there watching it type."
          >
            <input
              type="number"
              name="first_refusal_minutes"
              min={1}
              max={60}
              defaultValue={studio.first_refusal_minutes ?? 5}
              className="input w-28"
            />
          </Field>
        </section>

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

      {/* Above notifications: hearing what it says is the thing that makes
          everything above this worth filling in. */}
      <TryIt slug={studio.slug} />

      <Notifications />
    </div>
  );
}
