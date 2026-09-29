"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { SignatureBox } from "@/components/SignatureBox";
import { markOpened, submitForm, type SignState } from "./actions";
import { detailKey, type Block } from "@/lib/forms/blocks";
import { formatPence } from "@/lib/money";

/**
 * The form itself, on the customer's phone.
 *
 * Big targets, one column, the keyboard that suits each answer, and a
 * signature box that takes a finger. What is missing is listed at the top on
 * a failed submit rather than as red text somewhere down a long page they
 * have to scroll back through.
 */
export function FillForm({ token, blocks, business }: { token: string; blocks: Block[]; business: string }) {
  /*
   * Say it was opened, from the browser that opened it.
   *
   * The server used to mark it while rendering, which counts every preview
   * fetched by WhatsApp, iMessage or Outlook as the customer looking.
   */
  useEffect(() => {
    void markOpened(token);
  }, [token]);

  const [state, action, pending] = useActionState<SignState, FormData>(submitForm, {});
  const [yes, setYes] = useState<Record<string, boolean>>({});
  const top = useRef<HTMLDivElement>(null);
  const isQuote = blocks.some((b) => b.type === "lines");

  useEffect(() => {
    if (state.missing?.length || state.error) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  if (state.done) {
    return (
      <div className="card mt-6 p-6">
        <div className="text-3xl" aria-hidden>
          ✓
        </div>
        <h2 className="mt-3 text-lg font-semibold">{isQuote ? "Thank you, quote accepted" : "Thank you, that’s done"}</h2>
        <p className="hint mt-2">
          {isQuote ? `${business} has your acceptance and will be in touch.` : `Your form has gone to ${business}.`} You can
          close this page.
        </p>
      </div>
    );
  }

  return (
    <form
      /*
       * Submitted by hand rather than through the form's action.
       *
       * A form action clears every field once it returns, which is right for a
       * form that worked and cruel for one that did not: a customer who missed
       * one question of ten would have the other nine wiped and the signature
       * with them. Dispatching it ourselves keeps what they typed.
       */
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="mt-6 space-y-5"
    >
      <input type="hidden" name="token" value={token} />
      <div ref={top} />

      {(state.missing?.length || state.error) && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn" role="alert">
          {state.error ?? "A few things still need doing:"}
          {state.missing && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {state.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {blocks.map((b) => (
        <div key={b.id} className={b.type === "text" ? "" : "card p-4"}>
          {b.type === "text" && <p className="whitespace-pre-line text-sm leading-relaxed">{b.label}</p>}

          {b.type === "lines" && <QuoteTable items={b.items ?? []} by={b.by?.name} />}

          {(b.type === "short" || b.type === "long" || b.type === "date") && (
            <label className="block">
              <span className="text-sm font-medium">
                {b.label}
                {b.required && <span className="text-warn"> *</span>}
              </span>
              {b.help && <span className="hint mt-0.5 block text-xs">{b.help}</span>}
              {b.type === "long" ? (
                <textarea id={`q_${b.id}`} name={`q_${b.id}`} rows={3} className="input mt-2" />
              ) : (
                <input
                  id={`q_${b.id}`}
                  name={`q_${b.id}`}
                  type={b.type === "date" ? "date" : "text"}
                  className="input mt-2"
                  autoComplete={/name/i.test(b.label) ? "name" : /phone/i.test(b.label) ? "tel" : "off"}
                  inputMode={/phone/i.test(b.label) ? "tel" : undefined}
                />
              )}
            </label>
          )}

          {b.type === "yesno" && (
            <fieldset>
              <legend className="text-sm font-medium">
                {b.label}
                {b.required && <span className="text-warn"> *</span>}
              </legend>
              {b.help && <p className="hint mt-0.5 text-xs">{b.help}</p>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                {["yes", "no"].map((v) => (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                  >
                    <input
                      type="radio"
                      name={`q_${b.id}`}
                      value={v}
                      onChange={() => setYes((all) => ({ ...all, [b.id]: v === "yes" }))}
                      className="accent-[var(--accent)]"
                    />
                    {v === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
              {b.detailOnYes && yes[b.id] && (
                <label className="mt-3 block">
                  <span className="hint text-xs">Please tell us more</span>
                  <textarea id={`q_${detailKey(b.id)}`} name={`q_${detailKey(b.id)}`} rows={2} className="input mt-1" />
                </label>
              )}
            </fieldset>
          )}

          {b.type === "choice" && (
            <fieldset>
              <legend className="text-sm font-medium">
                {b.label}
                {b.required && <span className="text-warn"> *</span>}
              </legend>
              <div className="mt-2 space-y-2">
                {(b.options ?? []).map((o) => (
                  <label
                    key={o}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                  >
                    <input type="radio" name={`q_${b.id}`} value={o} className="accent-[var(--accent)]" />
                    {o}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {b.type === "agree" && (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                id={`q_${b.id}`}
                type="checkbox"
                name={`q_${b.id}`}
                className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
              />
              <span>{b.label}</span>
            </label>
          )}

          {b.type === "signature" && <SignatureBox />}
        </div>
      ))}

      <button disabled={pending} className="btn w-full bg-accent py-3 text-base text-on-accent disabled:opacity-60">
        {pending ? "Sending…" : isQuote ? "Accept and sign" : "Submit"}
      </button>
      <p className="hint text-center text-xs">
        By submitting you confirm the answers are yours. {business} keeps this form with your record.
      </p>
    </form>
  );
}

/**
 * A box to sign in with a finger or a mouse, and the typed name beside it.
 *
 * Drawn on a canvas at twice the size it shows, so the saved image is not a
 * blur, and kept as a small PNG. Touch is stopped from scrolling the page
 * while it is inside the box — otherwise signing on a phone drags the whole
 * form up and down under the finger.
 */
/*
 * SignatureBox used to be defined here, in full.
 *
 * It moved to components/SignatureBox on 29 September so the agreement a
 * business signs could use the same one. Copying a hundred and forty lines of
 * canvas code would have meant two signature boxes, and the two documents they
 * appear on are exactly the ones that get read again when there is a
 * disagreement — so a fix made to one copy and not the other is a fix that is
 * only in the document nobody is arguing about.
 *
 * It still talks to this form through named fields and nothing else, so nothing
 * about how this page submits has changed.
 */

/** The priced lines of a quote, and what they come to. Read, never edited. */
export function QuoteTable({ items, by }: { items: { name: string; quantity: number; pence: number }[]; by?: string }) {
  const total = items.reduce((n, it) => n + it.quantity * it.pence, 0);
  return (
    <table className="w-full text-sm tabular-nums">
      {by && <caption className="pb-2 text-left text-xs text-muted">Quoted by {by}</caption>}
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="border-b border-border">
            <td className="py-2 pr-2">
              {it.quantity > 1 ? `${it.quantity} × ` : ""}
              {it.name}
            </td>
            <td className="py-2 text-right">{formatPence(it.quantity * it.pence)}</td>
          </tr>
        ))}
        <tr>
          <td className="pt-3 font-semibold">Total</td>
          <td className="pt-3 text-right text-lg font-semibold">{formatPence(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
