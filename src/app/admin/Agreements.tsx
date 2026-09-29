"use client";

import { useActionState, useState } from "react";
import { CopyLink } from "@/components/CopyLink";
import { formatPence } from "@/lib/money";
import {
  sendAgreement,
  voidAgreement,
  giveNotice,
  type AgreementResult,
} from "./agreementActions";
import { whereItGot, type AgreementRow } from "@/lib/agreements/state";

/**
 * The agreements a business has, and sending them a new one.
 *
 * Giles, 27 Sep, on taking somebody on: "payment will be set up fee then
 * subscription which I will input into system, 60 day notice period to cancel
 * etc, options for trial period etc, not just fixed but bespoke ways of
 * charging, websites, Second Pair etc."
 *
 * ── Why the form is empty rather than pre-filled from the business ──────────
 *
 * `studios` already carries plan and plan_pence, and it would be easy to read
 * them in here as defaults. That would be wrong: those columns say what is true
 * today, and this form is a statement of what is about to be agreed. Somebody
 * renewing a client at a new price would find last year's figure already in the
 * box, and a figure you did not type is a figure you do not check.
 *
 * ── Why a signed one has no edit ────────────────────────────────────────────
 *
 * There is nothing to change on it. It is the record of what somebody put their
 * name to, and the way to alter what was agreed is a second agreement, not a
 * quiet edit of the first. Withdrawing one is offered only before it is signed,
 * and the action refuses it afterwards rather than trusting this screen.
 */
export function Agreements({
  studioId,
  business,
  rows,
  /** Where to send it, if we already know an address for the owner. */
  ownerEmail,
}: {
  studioId: string;
  business: string;
  rows: AgreementRow[];
  ownerEmail: string | null;
}) {
  const [sent, sendAction] = useActionState<AgreementResult, FormData>(sendAgreement, {});
  const [open, setOpen] = useState(false);

  /*
   * The form closes itself once one has actually been sent.
   *
   * It used to stay open with every figure still in it, which reads as "that
   * did not work" and invites a second press - and a second press sends a
   * second agreement to the same person with the same terms and a different
   * link. They then have two, and only one of them is the one they sign.
   *
   * Derived rather than set in an effect: `sent.ok` is already the answer, and
   * an effect calling setState on it would be the same cascading render this
   * codebase has ten of.
   */
  const showing = open && !sent.ok;
  const [voided, voidAction] = useActionState<AgreementResult, FormData>(voidAgreement, {});
  const [noted, noticeAction] = useActionState<AgreementResult, FormData>(giveNotice, {});

  const live = rows.filter((r) => !r.voidAt);

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="section-title">Agreement</h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn-ghost px-3 py-1 text-sm"
        >
          {showing ? "Never mind" : live.length || sent.ok ? "Send another" : "Send one"}
        </button>
      </div>

      {rows.length === 0 && !showing && !sent.ok && (
        <p className="hint mt-1">
          Nothing sent to {business} yet. Everything about what they pay, and the notice to
          end it, is per agreement rather than a plan.
        </p>
      )}

      {/* ─────────────────────────────────────────────── what they already have */}
      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const got = whereItGot(row);
            return (
              <li key={row.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm font-medium">{row.includes.join(", ") || "—"}</span>
                  <span
                    className={`pill text-xs ${
                      got.state === "signed"
                        ? "bg-ok/10 text-ok"
                        : got.state === "withdrawn"
                          ? "bg-surface-2 text-muted"
                          : "bg-warn/10 text-warn"
                    }`}
                  >
                    {got.said}
                  </span>
                </div>

                <p className="hint mt-1">
                  {row.setupFeePence > 0
                    ? `${formatPence(row.setupFeePence)} to set up, then `
                    : "No set-up fee, then "}
                  {formatPence(row.recurringPence)} {said(row.period)}.{" "}
                  {row.noticeDays} days&rsquo; notice.
                  {row.trialEndsOn ? ` Free until ${row.trialEndsOn}.` : ""}
                  {row.termsVersion ? ` Wording ${row.termsVersion}.` : ""}
                </p>

                {row.endsOn && (
                  <p className="hint mt-1 text-warn">
                    Notice given {row.noticeGivenOn}. Runs to {row.endsOn}.
                  </p>
                )}

                {/*
                  * The link, on every one of them including the signed ones.
                  *
                  * A signed agreement's link is the client's copy, and the
                  * commonest thing anybody will ever want from this panel is to
                  * send it to them again because they have lost the email.
                  */}
                {row.link && <CopyLink url={row.link} />}

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {!row.signedAt && !row.voidAt && (
                    <form action={voidAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className="text-sm text-muted hover:text-warn">
                        Withdraw it
                      </button>
                    </form>
                  )}

                  {/*
                    * Notice, only on one that is actually running.
                    *
                    * The end date is worked out from the term on this agreement
                    * and written down, rather than recomputed later — so changing
                    * the default cannot silently move a date somebody was given.
                    */}
                  {row.signedAt && !row.endsOn && (
                    <form action={noticeAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={row.id} />
                      <label className="hint">Notice given</label>
                      <input
                        type="date"
                        name="notice_given_on"
                        className="input w-40 py-1 text-sm"
                      />
                      <button type="submit" className="btn-ghost px-2.5 py-1 text-sm">
                        Note it
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ─────────────────────────────────────────────────────── sending a new one */}
      {showing && (
        <form action={sendAction} className="mt-4 space-y-3 border-t border-border pt-4">
          <input type="hidden" name="studio_id" value={studioId} />

          <label className="block">
            <span className="label">Send it to</span>
            <input
              name="sent_to"
              type="email"
              defaultValue={ownerEmail ?? ""}
              placeholder="them@theirbusiness.co.uk"
              className="input"
            />
          </label>

          <label className="block">
            <span className="label">What they are taking on</span>
            {/*
              * Typed, in the words the agreement will use, and separated by
              * commas. Free text rather than a set of tick boxes because the
              * third product will arrive before anybody remembers to add it to a
              * list — and because buildTerms works out whether to promise an
              * assistant from these words, which is what stops a website-only
              * agreement mentioning one.
              */}
            <input
              name="includes"
              defaultValue="the assistant"
              placeholder="the assistant, a website"
              className="input"
            />
            <span className="hint">
              Commas between them. &ldquo;a website&rdquo; on its own makes an agreement that
              says nothing about an assistant.
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">Set-up fee £</span>
              <input name="setup_fee" inputMode="decimal" placeholder="0" className="input" />
            </label>
            <label className="block">
              <span className="label">Then £</span>
              <input name="recurring" inputMode="decimal" placeholder="20" className="input" />
            </label>
            <label className="block">
              <span className="label">How often</span>
              <select name="period" defaultValue="monthly" className="input">
                <option value="monthly">a month</option>
                <option value="quarterly">a quarter</option>
                <option value="yearly">a year</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Free until</span>
              <input type="date" name="trial_ends_on" className="input" />
              <span className="hint">Leave blank for no trial, which is the usual answer.</span>
            </label>
            <label className="block">
              <span className="label">Notice to cancel, days</span>
              <input
                name="notice_days"
                inputMode="numeric"
                defaultValue="60"
                className="input"
              />
            </label>
          </div>

          <button type="submit" className="btn bg-accent px-4 py-2 text-on-accent">
            Build it and email the link
          </button>

          {/*
            * Said on the screen where one gets sent, not only in a comment.
            *
            * The wording has not been near a solicitor. Section 6 is an attempt
            * at the data processing agreement that UK GDPR Article 28 requires in
            * writing, and sixty days is long for a monthly subscription to a
            * small business. Both are defensible and neither is mine to settle.
            */}
          <p className="hint max-w-prose">
            The wording has not been reviewed by a solicitor. The clauses worth an hour of
            one are marked with a star in the document, and the data processing one is not
            optional in law.
          </p>
        </form>
      )}

      {[sent, voided, noted].map((state, i) =>
        state.error ? (
          <p key={i} className="mt-2 text-sm text-warn">
            {state.error}
          </p>
        ) : state.note ? (
          <p key={i} className="hint mt-2">
            {state.note}
          </p>
        ) : null,
      )}

      {sent.link && (
        <div className="mt-2">
          <CopyLink url={sent.link} />
        </div>
      )}
    </section>
  );
}

const said = (period: string) =>
  period === "yearly" ? "a year" : period === "quarterly" ? "a quarter" : "a month";
