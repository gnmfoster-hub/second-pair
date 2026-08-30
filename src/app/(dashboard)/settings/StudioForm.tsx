"use client";

import { useActionState, useState } from "react";
import { updateStudio, type FormState } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { penceToInput } from "@/lib/money";
import { DAY_NAMES, DEFAULT_HOURS, type Studio } from "@/lib/types";

export function StudioForm({ studio }: { studio: Studio }) {
  const [state, action] = useActionState<FormState, FormData>(updateStudio, {});
  const [depositType, setDepositType] = useState(studio.deposit_rule.type);
  const [depositMode, setDepositMode] = useState(studio.deposit_mode ?? "required");

  const hours = DEFAULT_HOURS.map(
    (d) => studio.hours.find((h) => h.day === d.day) ?? d,
  );

  return (
    <form action={action} className="space-y-8">
      <section className="card space-y-5 p-6">
        <h2 className="text-sm font-medium">Studio</h2>

        <Field label="Name">
          <input name="name" defaultValue={studio.name} className="input" required />
        </Field>

        <Field
          label="Tone of voice"
          hint="Written into the assistant's system prompt. Be specific: how you greet people, what you never say."
        >
          <textarea name="tone" defaultValue={studio.tone} rows={3} className="input" />
        </Field>

        <Field label="Timezone">
          <input name="timezone" defaultValue={studio.timezone} className="input" />
        </Field>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-medium">Opening hours</h2>
        <p className="hint mt-1">
          The assistant will not offer slots outside these hours, even if the calendar is free.
        </p>

        <div className="mt-5 space-y-2">
          {hours.map((h) => (
            <div key={h.day} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-muted">{DAY_NAMES[h.day]}</span>
              <input
                type="time"
                name={`hours_${h.day}_open`}
                defaultValue={h.open}
                className="input w-32"
              />
              <span className="text-muted">to</span>
              <input
                type="time"
                name={`hours_${h.day}_close`}
                defaultValue={h.close}
                className="input w-32"
              />
              <label className="ml-2 flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  name={`hours_${h.day}_closed`}
                  defaultChecked={h.closed}
                  className="accent-[var(--accent)]"
                />
                Closed
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-medium">Booking rules</h2>
        <p className="hint mt-1">
          How the assistant offers times. These apply to everyone in the studio.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Notice (hours)" hint="Nothing booked sooner than this.">
            <input
              name="notice_hours"
              type="number"
              min={0}
              max={720}
              defaultValue={studio.notice_hours}
              className="input"
            />
          </Field>
          <Field label="Consultation (mins)" hint="For sizes that need one first.">
            <input
              name="consultation_minutes"
              type="number"
              min={5}
              max={480}
              step={5}
              defaultValue={studio.consultation_minutes}
              className="input"
            />
          </Field>
          <Field label="Longest sitting (mins)" hint="Bigger jobs split across appointments.">
            <input
              name="max_session_minutes"
              type="number"
              min={30}
              max={1440}
              step={30}
              defaultValue={studio.max_session_minutes}
              className="input"
            />
          </Field>
        </div>
      </section>

      <section className="card space-y-5 p-6">
        <div>
          <h2 className="text-sm font-medium">Deposits</h2>
          <p className="hint mt-1">
            Stated in full before the payment link is ever sent.
          </p>
        </div>

        <Field label="Do you take deposits?">
          <div className="space-y-2">
            {(
              [
                ["required", "Yes — the slot is held until it is paid"],
                ["optional", "Offer it, but book them either way"],
                ["none", "No — never mention money, just book them in"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="deposit_mode"
                  value={value}
                  checked={depositMode === value}
                  onChange={() => setDepositMode(value)}
                  className="accent-[var(--accent)]"
                />
                {label}
              </label>
            ))}
          </div>
        </Field>

        {depositMode === "none" ? (
          <p className="hint">
            The assistant will qualify, quote and book, and will never ask anyone for
            payment. Nothing below applies.
          </p>
        ) : (
        <>
        <Field label="Deposit rule">
          <div className="flex gap-4">
            {(["fixed", "percent"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="deposit_type"
                  value={t}
                  checked={depositType === t}
                  onChange={() => setDepositType(t)}
                  className="accent-[var(--accent)]"
                />
                {t === "fixed" ? "Fixed amount" : "Percentage of estimate"}
              </label>
            ))}
          </div>
        </Field>

        {depositType === "fixed" ? (
          <Field label="Amount (£)">
            <input
              name="deposit_amount"
              className="input max-w-40"
              defaultValue={
                studio.deposit_rule.type === "fixed"
                  ? penceToInput(studio.deposit_rule.amount_pence)
                  : "50"
              }
            />
          </Field>
        ) : (
          <div className="flex gap-4">
            <Field label="Percent">
              <input
                name="deposit_percent"
                type="number"
                min={1}
                max={100}
                className="input w-32"
                defaultValue={
                  studio.deposit_rule.type === "percent" ? studio.deposit_rule.percent : 20
                }
              />
            </Field>
            <Field label="Minimum (£)">
              <input
                name="deposit_min"
                className="input w-32"
                defaultValue={
                  studio.deposit_rule.type === "percent"
                    ? penceToInput(studio.deposit_rule.min_pence)
                    : "50"
                }
              />
            </Field>
          </div>
        )}

        <Field
          label="Cancellation policy"
          hint="Read out word for word before any payment link. Write {{amount}} where the deposit figure should go and it is filled in automatically."
        >
          <textarea
            name="cancellation_policy"
            defaultValue={studio.cancellation_policy}
            rows={4}
            className="input"
            placeholder="Deposits are non-refundable. Reschedule with at least 48 hours' notice and your deposit moves with you."
          />
        </Field>

        <Field
          label="Stripe account ID"
          hint="From Stripe Connect. Deposits are paid directly to you."
        >
          <input
            name="stripe_account_id"
            defaultValue={studio.stripe_account_id ?? ""}
            placeholder="acct_…"
            className="input max-w-md font-mono text-xs"
          />
        </Field>
        </>
        )}
      </section>

      <section className="card space-y-5 p-6">
        <h2 className="text-sm font-medium">Compliance</h2>

        <Field
          label="Full terms URL"
          hint="Optional. The full booking and cancellation terms on your own site — the assistant links it if someone wants the detail."
        >
          <input
            name="terms_url"
            type="url"
            defaultValue={studio.terms_url ?? ""}
            placeholder="https://livingcanvastattoo.ink/terms"
            className="input max-w-md"
          />
        </Field>

        <Field
          label="Privacy notice URL"
          hint="Linked in the assistant's first message on every channel. Required under UK GDPR."
        >
          <input
            name="privacy_notice_url"
            type="url"
            defaultValue={studio.privacy_notice_url ?? ""}
            placeholder="https://livingcanvastattoo.ink/privacy"
            className="input max-w-md"
          />
        </Field>
      </section>

      <div className="flex items-center gap-4">
        <SubmitButton />
        <FormMessage state={state} />
      </div>
    </form>
  );
}
