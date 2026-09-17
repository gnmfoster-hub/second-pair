"use client";

import { useActionState, useState } from "react";
import { updateStudio, type FormState } from "./actions";
import { Field, SubmitButton } from "@/components/Form";
import { SaveBar } from "@/components/SaveBar";
import { DEFAULT_ASSISTANT_NAME } from "@/lib/assistantName";
import { penceToInput } from "@/lib/money";
import { DAY_NAMES, DEFAULT_HOURS, type Studio } from "@/lib/types";
import { verticalPack } from "@/lib/verticals";
import { ColourBy } from "@/app/(dashboard)/diary/ColourBy";
import type { ColourMode } from "@/lib/diaryColour";

export function StudioForm({
  studio,
  lastSaved,
  canConnectStripe,
}: {
  studio: Studio;
  /** When these settings last saved, already in words. */
  lastSaved: string | null;
  /**
   * Whether connecting is switched on at our end. False means the platform
   * key is not set, and the button below would send somebody to Stripe and
   * bounce them straight back — so it says so instead of offering that.
   */
  canConnectStripe: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateStudio, {});
  const [depositType, setDepositType] = useState(studio.deposit_rule.type);
  const [depositMode, setDepositMode] = useState(studio.deposit_mode ?? "required");
  const [travelMode, setTravelMode] = useState(studio.travel_mode ?? "at_premises");
  /*
   * Whether there is any VAT to talk about.
   *
   * Held in state so the rest of the section can disappear when there is not.
   * A business that is not registered was still being asked whether its prices
   * include VAT, and neither answer is true — there is no VAT in them at all,
   * and being made to pick one reads as the product not believing you.
   */
  /*
   * Three answers in one value: none, included, added. Kept as one piece of
   * state so the screen cannot show a half-answered question — registered with
   * neither "included" nor "added" chosen was possible before.
   */
  const [vatMode, setVatMode] = useState<"none" | "included" | "added">(
    !studio.vat_registered ? "none" : studio.prices_include_vat ? "included" : "added",
  );
  const pack = verticalPack(studio.vertical);
  const packGreeting = pack.greeting;
  /* The dates this trade keeps that can be said in advance — often none. */
  const dueLabels = pack.facts
    .filter((f) => f.remindBefore)
    .map((f) => f.label.toLowerCase());
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
          hint="Where a customer's reply goes, and where we tell you somebody has booked. Email we send for you comes from our address, so without this an answer reaches nobody."
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
          explain="Written into the assistant's system prompt. Be specific: how you greet people, what you never say."
        >
          <textarea name="tone" defaultValue={studio.tone} rows={3} className="input" />
        </Field>

        <Field
          label="What the assistant calls itself"
          explain={`A name gives somebody something to say back to — "thanks Robin" is a different conversation from "thanks". Blank uses ${DEFAULT_ASSISTANT_NAME}. It always says it is an assistant when asked, name or no name.`}
        >
          <input
            name="assistant_name"
            defaultValue={studio.assistant_name ?? ""}
            placeholder={DEFAULT_ASSISTANT_NAME}
            className="input max-w-xs"
            maxLength={40}
          />
        </Field>

        <Field
          label="Opening line in the chat"
          explain={`The first thing someone reads before they have typed anything. Leave it blank and it uses your trade's: "${packGreeting}"`}
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

        {/*
          * Save, here, where the hours are.
          *
          * There has been a save button for this all along, at the foot of a
          * form six hundred lines long, following you down the page. It was
          * reported missing anyway, twice — and that is the answer rather than
          * the objection: whether a control exists is not the question,
          * whether somebody who has just changed a Tuesday closing time can
          * see one is. Opening hours are the setting people come back to, in
          * a hurry, and they sit near the top.
          *
          * It saves the whole form, exactly as the bar at the bottom does —
          * one form, one action, so the two cannot disagree about what went
          * in. The stamp sits beside it, because "did that go in?" is what
          * brings somebody back to this screen a second time.
          */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <SubmitButton>Save opening hours</SubmitButton>
          {state.ok && <span className="text-sm text-ok">Saved.</span>}
          {state.error && <span className="text-sm text-bad">{state.error}</span>}
          <span className="hint ml-auto">
            {lastSaved ? `Last saved ${lastSaved}` : "Never saved"}
          </span>
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

        {/*
          * A button, not a box to paste an account id into.
          *
          * This asked for "acct_…" from Stripe Connect, which assumes somebody
          * who knows what Connect is and where to find an account id inside
          * it. Nobody running a salon does, so in practice nobody connected —
          * and a business with no connected account cannot take a deposit at
          * all, because the charge is refused rather than routed into our own
          * Stripe.
          *
          * The money never passes through us either way. This is a Standard
          * connected account: they keep their own Stripe dashboard, their
          * customers pay them directly, and refunds and disputes are theirs to
          * settle. Saying so here matters more than the button does — it is
          * the question every owner asks before typing a card number into
          * anything.
          */}
        {/*
          * Connecting Stripe lives on Getting paid now.
          *
          * It was here, under the opening hours, while settings were one long
          * page. Grouping them gave getting paid a page of its own and this
          * stayed behind — so a business on the one-account model found the
          * switches about taking money on one page and the only way to connect
          * an account on another, which is how Living Canvas ended up with
          * nowhere to press. One place, and this points at it.
          */}
        <Field label="Taking the money">
          <p className="hint max-w-prose">
            {studio.stripe_account_id ? (
              <>
                Stripe is connected.{" "}
                <a href="/settings/money" className="underline">
                  Getting paid
                </a>{" "}
                is where to change it, and where deposits and who the money lands with live.
              </>
            ) : (
              <>
                Connect the business&rsquo;s Stripe under{" "}
                <a href="/settings/money" className="underline">
                  Getting paid
                </a>
                , along with deposits and whose account the money lands in.
              </>
            )}
          </p>
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
              explain="Left either side of every job, so two cannot be booked back to back across town."
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

        {/*
          * One question with three answers, rather than a tick box and then a
          * choice between two things that are both wrong when it is not ticked.
          *
          * Most small businesses are under the threshold and charge no VAT at
          * all; being shown "prices include VAT" and "add VAT before quoting"
          * as the only options reads as though VAT is assumed and they are
          * picking how it is applied.
          */}
        <fieldset>
          <legend className="label">What VAT do you charge?</legend>

          <label className="mt-2 flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="vat_mode"
              value="none"
              checked={vatMode === "none"}
              onChange={() => setVatMode("none")}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              None &mdash; we are not VAT registered
              <span className="hint block">
                The usual answer under the threshold. Your prices are quoted exactly as you
                enter them and the assistant never mentions VAT.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="vat_mode"
              value="included"
              checked={vatMode === "included"}
              onChange={() => setVatMode("included")}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Registered &mdash; the prices I enter already include VAT
              <span className="hint block">
                Quoted as they are, with a line saying VAT is included. Usual where you sell
                to the public.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="vat_mode"
              value="added"
              checked={vatMode === "added"}
              onChange={() => setVatMode("added")}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Registered &mdash; add VAT to the prices I enter
              <span className="hint block">
                The assistant adds it before quoting and says so. Usual where you work for
                other businesses.
              </span>
            </span>
          </label>
        </fieldset>

        {vatMode !== "none" && (
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
            <Field label="VAT number" explain="Optional. Shown on receipts.">
              <input
                name="vat_number"
                defaultValue={studio.vat_number ?? ""}
                placeholder="GB123456789"
                className="input font-mono text-xs"
              />
            </Field>
          </div>
        )}

      </section>

      <section className="card space-y-5 p-6">
        <h2 className="section-title">Compliance</h2>

        <Field
          label="Full terms URL"
          explain="Optional. The full booking and cancellation terms on your own site — the assistant links it if someone wants the detail."
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

        {/*
          * Asking for a review, which is the cheapest marketing a small
          * business has and the one nobody remembers to do.
          *
          * Off until a link is given, deliberately: a switch that is on with
          * nowhere to send people would send a message with a hole in it. The
          * text goes the morning after, once, and never to somebody who has
          * said stop.
          */}
        <Field
          label="Ask for a review"
          hint="Sent the morning after an appointment, once, by text or email. Never to somebody who has texted STOP."
        >
          <input
            name="review_url"
            type="url"
            defaultValue={(studio as unknown as { review_url?: string | null }).review_url ?? ""}
            placeholder="https://g.page/r/your-google-review-link"
            className="input max-w-md"
          />
          <label className="mt-2 flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="review_ask"
              defaultChecked={(studio as unknown as { review_ask?: boolean | null }).review_ask === true}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Send it
              <span className="hint block">
                Paste your Google review link above first &mdash; in Google Business Profile, under
                Ask for reviews. Nothing is sent until both are set.
              </span>
            </span>
          </label>
        </Field>

        {/*
          * The dates this trade keeps, said before they fall due.
          *
          * Only shown to a trade that has any — a plasterer has no MOT, and a
          * switch for something that can never happen is clutter with a
          * question attached.
          */}
        {dueLabels.length > 0 && (
          <Field
            label="Remind them what's coming up"
            hint={`Sent once, well before the day, by text or email. Never to somebody who has texted STOP.`}
            explain={`We keep ${dueLabels.join(" and ")} on a customer's record. This tells them before it falls due, and offers them a slot — which is the part the reminder they get from anybody else is missing.`}
          >
            <input type="hidden" name="fact_reminders_shown" value="1" />
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="fact_reminders"
                defaultChecked={
                  (studio as unknown as { fact_reminders?: boolean | null }).fact_reminders !== false
                }
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                Send it
                <span className="hint block">
                  Only to people whose date you have filled in on their record.
                </span>
              </span>
            </label>
          </Field>
        )}
      </section>

      {/*
        * What this business calls things.
        *
        * The trade pack supplies a starting point and it is right most of the
        * time, but "most of the time" is doing a lot of work: the demo is a
        * hair salon whose people were called artists, doing tattoos, because
        * it was set up from the wrong pack and nothing could correct it.
        *
        * Only the collective nouns are offered, not every word the pack holds.
        * What a business calls its people and its customers is said on every
        * screen and in every message; the rest is internal and changing it
        * would be four more boxes for no visible gain.
        *
        * The pack's own word is the placeholder, so an empty box is not a
        * missing answer — it means "whatever my trade normally says", which is
        * also what gets stored: blank saves nothing and keeps following the
        * pack as it improves.
        */}
      <section className="card space-y-4 p-6">
        <div>
          <h2 className="section-title">What you call things</h2>
          <p className="hint mt-1">
            Used everywhere &mdash; the tabs, the diary, and what the assistant says to
            your {words.customer}s. Leave a box empty to use the normal word for your
            trade.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="One of your people" hint="Stylist, therapist, technician, fitter.">
            <input
              name="word_practitioner"
              defaultValue={studio.vocabulary?.practitioner ?? ""}
              placeholder={pack.vocabulary.practitioner}
              className="input"
              maxLength={24}
            />
          </Field>

          <Field label="More than one" hint="Shown on the tab and above the diary.">
            <input
              name="word_practitioners"
              defaultValue={studio.vocabulary?.practitioners ?? ""}
              placeholder={pack.vocabulary.practitioners}
              className="input"
              maxLength={24}
            />
          </Field>

          <Field label="Someone who books" hint="Client, customer, patient, guest.">
            <input
              name="word_customer"
              defaultValue={studio.vocabulary?.customer ?? ""}
              placeholder={pack.vocabulary.customer}
              className="input"
              maxLength={24}
            />
          </Field>

          <Field label="The place itself" hint="Salon, studio, shop, practice.">
            <input
              name="word_business"
              defaultValue={studio.vocabulary?.business ?? ""}
              placeholder={pack.vocabulary.business}
              className="input"
              maxLength={24}
            />
          </Field>
        </div>

        <p className="hint">
          If your people do different jobs &mdash; a stylist and a nail technician in the
          same {studio.vocabulary?.business ?? pack.vocabulary.business} &mdash; pick the
          word that covers all of them here, and give each person their own job title on
          their own settings.
        </p>
      </section>

      {/*
        * The diary's colours, which used to live in the diary's toolbar.
        *
        * On a phone that toolbar could not hold it: measured on a 1080px
        * screen it wrapped onto a row entirely of its own, one small round
        * button with three hundred and forty empty pixels beside it, above a
        * diary that wants every pixel.
        *
        * It belongs here anyway. It is a preference set once and then left —
        * which is exactly what this page is for, and unlike the view buttons
        * beside it, nobody changes it while reading their day.
        *
        * It saves itself the moment it is picked rather than waiting for the
        * button below, because it always did and changing that would be a
        * worse surprise than the inconsistency.
        */}
      <section className="card space-y-4 p-6">
        <div>
          <h2 className="section-title">Diary</h2>
          <p className="hint mt-1">
            What the colours on your appointments mean. Saved as soon as you pick one.
          </p>
        </div>

        <ColourBy
          current={(studio.diary_colour ?? "category") as ColourMode}
          hasTeam
        />
      </section>

      {/*
       * Save, where you can reach it.
       *
       * This was a button at the bottom of six hundred lines of form, and
       * opening hours are near the top — so somebody changing a Tuesday
       * closing time saw no save button anywhere on screen and reasonably
       * assumed it saved itself.
       */}
      <SaveBar state={state} lastSaved={lastSaved} />
    </form>
  );
}
