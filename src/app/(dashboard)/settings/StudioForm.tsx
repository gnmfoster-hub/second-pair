"use client";

import { useActionState, useState } from "react";
import { updateStudio, type FormState } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { penceToInput } from "@/lib/money";
import { DAY_NAMES, DEFAULT_HOURS, type Studio } from "@/lib/types";
import { verticalPack } from "@/lib/verticals";

export function StudioForm({ studio }: { studio: Studio }) {
  const [state, action] = useActionState<FormState, FormData>(updateStudio, {});
  const [depositType, setDepositType] = useState(studio.deposit_rule.type);
  const [depositMode, setDepositMode] = useState(studio.deposit_mode ?? "required");
  const [travelMode, setTravelMode] = useState(studio.travel_mode ?? "at_premises");
  const pack = verticalPack(studio.vertical);
  const packGreeting = pack.greeting;
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const title = (word: string) => word.replace(/^./, (c) => c.toUpperCase());

  const hours = DEFAULT_HOURS.map(
    (d) => studio.hours.find((h) => h.day === d.day) ?? d,
  );

  return (
    <form action={action} className="space-y-8">
      <section className="card space-y-5 p-6">
        <h2 className="section-title">{title(words.business)}</h2>

        <Field label="Name">
          <input name="name" defaultValue={studio.name} className="input max-w-md" required />
        </Field>

        <Field
          label="Email"
          hint="Where a customer's reply goes. Email we send for you comes from our address, so without this an answer reaches nobody."
        >
          <input
            name="email"
            type="email"
            defaultValue={studio.email ?? ""}
            className="input max-w-md"
          />
        </Field>

        <Field
          label="Tone of voice"
          hint="Written into the assistant's system prompt. Be specific: how you greet people, what you never say."
        >
          <textarea name="tone" defaultValue={studio.tone} rows={3} className="input" />
        </Field>

        <Field
          label="Opening line in the chat"
          hint={`The first thing someone reads before they have typed anything. Leave it blank and it uses your trade's: "${packGreeting}"`}
        >
          <input
            name="greeting"
            defaultValue={studio.greeting ?? ""}
            placeholder={packGreeting}
            className="input"
            maxLength={200}
          />
        </Field>

        <Field label="Timezone">
          <input name="timezone" defaultValue={studio.timezone} className="input max-w-xs" />
        </Field>
      </section>

      <section className="card p-6">
        <h2 className="section-title">Opening hours</h2>
        <p className="hint mt-1">
          The assistant will not offer slots outside these hours, even if the calendar is free.
        </p>

        <div className="mt-5 space-y-2">
          {hours.map((h) => (
            /*
             * Wraps on a phone, and the times share what is left.
             *
             * The day, two fixed 128px time fields and a Closed box sat in a
             * row that could not break — a hundred and seventeen pixels wider
             * than a 390px screen, so the close time and the Closed box were
             * off the edge. This is the first screen a new business is sent
             * to, from the diary, and half of it could not be reached.
             *
             * The fields keep a real width rather than flexing. Letting them
             * share what was left collapsed them to fifty-seven pixels, which
             * fits the row and shows a clock icon and no time — the measurement
             * said it was fixed and the screen said otherwise.
             */
            <div key={h.day} className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* Its own line on a phone, so the pair of times stays together and
                  "to" does not dangle at the end of a wrapped row. */}
              <span className="w-full text-sm font-medium sm:w-24 sm:shrink-0 sm:font-normal sm:text-muted">
                {DAY_NAMES[h.day]}
              </span>
              <input
                type="time"
                name={`hours_${h.day}_open`}
                defaultValue={h.open}
                className="input w-[6.75rem] shrink-0 sm:w-32"
              />
              <span className="text-muted">to</span>
              <input
                type="time"
                name={`hours_${h.day}_close`}
                defaultValue={h.close}
                className="input w-[6.75rem] shrink-0 sm:w-32"
              />
              <label className="flex items-center gap-2 text-sm text-muted sm:ml-2">
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
        <h2 className="section-title">Booking rules</h2>
        <p className="hint mt-1">
          How the assistant offers times. These apply to everyone in the {words.business}.
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
          <h2 className="section-title">Deposits</h2>
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
        <h2 className="section-title">Where the work happens</h2>

        <Field label="Do you travel to customers?">
          <div className="space-y-2">
            {(
              [
                ["at_premises", "They come to us"],
                ["at_customer", "We go to them"],
                ["both", "Both, depending on the job"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="travel_mode"
                  value={value}
                  checked={travelMode === value}
                  onChange={() => setTravelMode(value)}
                  className="accent-[var(--accent)]"
                />
                {label}
              </label>
            ))}
          </div>
        </Field>

        {travelMode !== "at_premises" && (
          <>
            <Field
              label="Travelling time (minutes)"
              hint="Left either side of every job, so two cannot be booked back to back across town."
            >
              <input
                name="travel_buffer_minutes"
                type="number"
                min={0}
                max={240}
                step={5}
                defaultValue={studio.travel_buffer_minutes}
                className="input w-32"
              />
            </Field>

            <Field
              label="Areas you cover"
              hint="Postcode areas or districts, separated by commas — BS, BA, TA16. Leave blank to cover everywhere."
            >
              <input
                name="service_areas"
                defaultValue={(studio.service_areas ?? []).join(", ")}
                placeholder="BS, BA, GL"
                className="input max-w-md"
              />
              <p className="hint mt-1.5">
                Anything outside these and the assistant will say so rather than offering a
                time it cannot honour.
              </p>
            </Field>
          </>
        )}
      </section>

      <section className="card space-y-5 p-6">
        <h2 className="section-title">VAT</h2>
        <p className="hint">
          Only affects what the assistant quotes. Nothing here goes near your bookkeeping —
          that is your accountant&rsquo;s job, not ours.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="vat_registered"
            defaultChecked={studio.vat_registered}
            className="accent-[var(--accent)]"
          />
          We are VAT registered
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rate (%)">
            <input
              name="vat_rate_percent"
              type="number"
              min={0}
              max={100}
              step={0.5}
              defaultValue={studio.vat_rate_percent}
              className="input"
            />
          </Field>
          <Field label="VAT number" hint="Optional.">
            <input
              name="vat_number"
              defaultValue={studio.vat_number ?? ""}
              placeholder="GB123456789"
              className="input font-mono text-xs"
            />
          </Field>
        </div>

        <Field label="The prices you have entered">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="prices_include_vat"
                value="on"
                defaultChecked={studio.prices_include_vat}
                className="accent-[var(--accent)]"
              />
              Already include VAT — quote them as they are
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="prices_include_vat"
                value="off"
                defaultChecked={!studio.prices_include_vat}
                className="accent-[var(--accent)]"
              />
              Exclude VAT — add it before quoting
            </label>
          </div>
        </Field>
      </section>

      <section className="card space-y-5 p-6">
        <h2 className="section-title">Compliance</h2>

        <Field
          label="Full terms URL"
          hint="Optional. The full booking and cancellation terms on your own site — the assistant links it if someone wants the detail."
        >
          <input
            name="terms_url"
            type="url"
            defaultValue={studio.terms_url ?? ""}
            placeholder="https://yourbusiness.co.uk/terms"
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
            placeholder="https://yourbusiness.co.uk/privacy"
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
