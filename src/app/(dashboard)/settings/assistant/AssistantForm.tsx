"use client";

import { useActionState, useEffect, useState } from "react";
import { updateAssistant, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { verticalPack } from "@/lib/verticals";
import { Notifications } from "@/components/Notifications";
import { OnYourPhone } from "@/components/OnYourPhone";
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

  /*
   * Follow the saved examples back.
   *
   * These start from a prop and then stop listening to it. An example that the
   * save dropped — because only one half of it was filled in — stayed on
   * screen looking saved, so the next visit was the first anybody knew it had
   * gone.
   */
  useEffect(() => {
    setExamples(
      studio.voice_examples?.length ? studio.voice_examples : [{ ask: "", reply: "" }],
    );
  }, [studio.voice_examples]);

  const edit = (i: number, part: "ask" | "reply", value: string) =>
    setExamples((all) => all.map((e, j) => (j === i ? { ...e, [part]: value } : e)));

  /*
   * An example needs both halves to teach anything.
   *
   * A question with no answer shows the assistant nothing, so the save drops
   * it — correctly, and until now silently: the page said "Saved" and the
   * example simply was not there next time. Saying so on the box itself means
   * it is fixed before it is lost rather than discovered afterwards.
   */
  const halfDone = examples.some((e) => Boolean(e.ask.trim()) !== Boolean(e.reply.trim()));

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

        {/*
          * Only matters to a business forwarding email to us, which is why it
          * sits under its own heading rather than beside the answering mode —
          * the two sound alike and one of them is about every channel.
          */}
        <section className="card space-y-5 p-6">
          <div>
            <h2 className="section-title">Email you forward here</h2>
            <p className="hint mt-1 max-w-prose">
              Only about email. If you forward a single enquiry address, leave this
              alone. If you forward everything that arrives in your mailbox, the second
              option is the one you want &mdash; without it the assistant will answer
              your accountant.
            </p>
          </div>

          <div className="space-y-2.5">
            {[
              {
                value: "all",
                title: "Answer anything that looks like a customer",
                body:
                  "Right when what you forward is an enquiry address — hello@, info@, the one on your van. Newsletters, bounces and automatic messages are never answered whichever of these you pick.",
              },
              {
                value: "listed",
                title: "Only answer mail sent to my public addresses",
                body:
                  "For a mailbox where work and everything else arrive together. Name the addresses customers write to; anything sent to any other address of yours is filed here for you to read, unanswered.",
              },
              {
                value: "none",
                title: "Never answer email on its own",
                body:
                  "Everything is filed here, tidied and waiting, and you write every reply yourself. The assistant still answers your website, texts and social messages as normal.",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="row flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors has-[:checked]:border-accent has-[:checked]:bg-surface-2/60"
              >
                <input
                  type="radio"
                  name="inbound_mode"
                  value={option.value}
                  defaultChecked={(studio.inbound_mode ?? "all") === option.value}
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
            label="Your public addresses"
            hint="One per line, and only used by the middle option. These are the addresses on your website and your van — the ones a stranger writes to."
          >
            <textarea
              name="inbound_addresses"
              rows={3}
              defaultValue={(studio.inbound_addresses ?? []).join("\n")}
              placeholder={"hello@yourfirm.co.uk\nenquiries@yourfirm.co.uk"}
              className="input font-mono text-sm"
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

                {/*
                  * Controlled, not defaultValue.
                  *
                  * With defaultValue and an index for a key, removing the first
                  * of two examples left React reusing the same input and
                  * ignoring the new default — so the one that stayed showed the
                  * text of the one that went.
                  */}
                <input
                  name="example_ask"
                  value={example.ask}
                  onChange={(e) => edit(i, "ask", e.target.value)}
                  className="input"
                  placeholder={`Someone asks: how much for a ${words.service}?`}
                  maxLength={300}
                />
                <textarea
                  name="example_reply"
                  value={example.reply}
                  onChange={(e) => edit(i, "reply", e.target.value)}
                  rows={3}
                  className="input mt-2"
                  placeholder="You answer: …in your own words, exactly as you'd type it"
                  maxLength={1000}
                />
                {Boolean(example.ask.trim()) !== Boolean(example.reply.trim()) && (
                  <p className="mt-2 text-xs text-warn">
                    {example.ask.trim()
                      ? "Add the reply you would have typed, or this one will not be saved."
                      : "Add the question somebody asked, or this one will not be saved."}
                  </p>
                )}
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
          {/*
            * Beside the button, not only on the box.
            *
            * Somebody who has scrolled past a half-filled example is about to
            * lose it, and the message that would have told them is now off the
            * top of the screen.
            */}
          {halfDone && (
            <span className="text-sm text-warn">
              One example is missing half of itself and will not be saved.
            </span>
          )}
        </div>
      </form>

      {/* Above notifications: hearing what it says is the thing that makes
          everything above this worth filling in. */}
      <TryIt slug={studio.slug} />

      <Notifications />

      {/*
        * Directly under notifications, because on an iPhone one is the gate in
        * front of the other: Apple will not deliver a notification to a page in
        * Safari at all, so somebody turning them on there and hearing nothing
        * needs the next panel to be the reason why.
        */}
      <OnYourPhone />
    </div>
  );
}
