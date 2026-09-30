"use client";

import { useActionState, useEffect, useState } from "react";
import { CopyLink } from "@/components/CopyLink";
import { formatPence } from "@/lib/money";
import {
  sendAgreement,
  voidAgreement,
  giveNotice,
  type AgreementResult,
} from "./agreementActions";
import { whereItGot, type AgreementRow } from "@/lib/agreements/state";
import { buildTerms, TERMS_VERSION } from "@/lib/agreements/terms";

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
  /*
   * Which round of sending this is.
   *
   * The form lives in its own component below, keyed on this number, so asking
   * to send another gives a genuinely new one - empty boxes and no memory of the
   * last result.
   *
   * The version before this derived visibility from "has one been sent", which
   * closed the form after a send as intended and then made it impossible to open
   * again: the send result never goes away, so the condition hiding the form was
   * true for ever. Found by a check that tried to send a second and could not.
   * Remounting is the React answer to "start again" and a boolean was never
   * going to be.
   */
  const [round, setRound] = useState(0);
  const [open, setOpen] = useState(false);
  const [lastSent, setLastSent] = useState<AgreementResult | null>(null);
  /*
   * The unsigned one being corrected, if any.
   *
   * Giles, 30 Sep: "you can't preview, amend etc." Amending an UNSIGNED one is
   * the thing that was missing. A signed one still cannot be touched, and that
   * is not an oversight: it is the record of what somebody put their name to.
   *
   * What this does is not an edit. The old one is withdrawn and a new one is
   * sent, with a new link, which is the honest shape - the wording on an
   * agreement is frozen at the moment it is sent, and the whole reason a
   * signature means anything is that nothing can go back and change it
   * afterwards. So this saves the retyping without pretending a document can be
   * amended in place.
   */
  const [amending, setAmending] = useState<AgreementRow | null>(null);
  const [voided, voidAction] = useActionState<AgreementResult, FormData>(voidAgreement, {});
  const [noted, noticeAction] = useActionState<AgreementResult, FormData>(giveNotice, {});

  const live = rows.filter((r) => !r.voidAt);

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="section-title">Agreement</h3>
        <button
          type="button"
          onClick={() => {
            /* A new round each time it is opened, so nothing is carried over. */
            if (!open) setRound((r) => r + 1);
            else setAmending(null);
            setOpen((o) => !o);
          }}
          className="btn-ghost px-3 py-1 text-sm"
        >
          {open ? "Never mind" : live.length || lastSent ? "Send another" : "Send one"}
        </button>
      </div>

      {rows.length === 0 && !open && !lastSent && (
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

                {/*
                  * The wording, readable from here.
                  *
                  * The one moment anybody needs to read a signed agreement is
                  * when there is a disagreement about it, and until now the only
                  * way was to open the client's own private link. On a signed one
                  * this is the actual evidence; on an unsent one it is what you
                  * are about to be held to.
                  */}
                {row.termsText && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-muted">
                      Read the wording
                    </summary>
                    <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line rounded-lg bg-surface-2/60 p-3 text-[12.5px] leading-relaxed">
                      {row.termsText}
                    </div>
                  </details>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {!row.signedAt && !row.voidAt && (
                    <button
                      type="button"
                      onClick={() => {
                        setAmending(row);
                        setRound((r) => r + 1);
                        setOpen(true);
                      }}
                      className="text-sm text-muted hover:text-foreground"
                    >
                      Change it
                    </button>
                  )}

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
      {open && (
        <SendForm
          key={round}
          studioId={studioId}
          business={business}
          ownerEmail={ownerEmail}
          amending={amending}
          onSent={(result) => {
            setLastSent(result);
            setAmending(null);
            /* Closed once it has gone, so a second press cannot send a second. */
            setOpen(false);
          }}
        />
      )}

      {[lastSent, voided, noted].map((state, i) =>
        state?.error ? (
          <p key={i} className="mt-2 text-sm text-warn">
            {state.error}
          </p>
        ) : state?.note ? (
          <p key={i} className="hint mt-2">
            {state.note}
          </p>
        ) : null,
      )}

      {lastSent?.link && (
        <div className="mt-2">
          <CopyLink url={lastSent.link} />
        </div>
      )}
    </section>
  );
}

const said = (period: string) =>
  period === "yearly" ? "a year" : period === "quarterly" ? "a quarter" : "a month";

/**
 * The form that builds and sends one.
 *
 * Its own component so the parent can hand it a new key and get a genuinely
 * fresh one: empty boxes, and no memory of the last send sitting in a hook.
 * The alternative was deriving "is the form showing" from "has one been sent",
 * which closed it after a send and then never let it open again, because a send
 * result does not go away.
 */
function SendForm({
  studioId,
  business,
  ownerEmail,
  /** An unsigned one being corrected, whose figures start this off. */
  amending,
  onSent,
}: {
  studioId: string;
  business: string;
  ownerEmail: string | null;
  amending?: AgreementRow | null;
  onSent: (result: AgreementResult) => void;
}) {
  const [sent, sendAction] = useActionState<AgreementResult, FormData>(sendAgreement, {});

  /*
   * ── Controlled, so the wording can be read before it is sent ──────────────
   *
   * Giles, 30 Sep: "you can't preview, amend etc the agreement which is weird."
   *
   * He is right, and it was worse than weird. You typed four figures, pressed a
   * button, and the first person to read the document was the client. For a
   * legal agreement with a notice period and a data processing clause in it,
   * "send it and then open the client's own link to see what you sent" is not a
   * workflow, it is a hope.
   *
   * buildTerms imports nothing at all, which is what makes this honest rather
   * than approximate: the panel below is not a mock-up of the wording, it is the
   * wording, from the same function the action calls. If the two could ever
   * disagree the preview would be worse than none.
   */
  const [to, setTo] = useState(amending?.sentTo ?? ownerEmail ?? "");
  const [includes, setIncludes] = useState(
    (amending?.includes ?? ["the assistant"]).join(", "),
  );
  const [setupFee, setSetupFee] = useState(
    amending ? String(amending.setupFeePence / 100) : "",
  );
  const [recurring, setRecurring] = useState(
    amending ? String(amending.recurringPence / 100) : "",
  );
  const [period, setPeriod] = useState(amending?.period ?? "monthly");
  const [trialEndsOn, setTrialEndsOn] = useState(amending?.trialEndsOn ?? "");
  const [noticeDays, setNoticeDays] = useState(String(amending?.noticeDays ?? 60));

  /*
   * The same arithmetic the action does, for the same reason.
   *
   * Pounds typed, pence stored, rounded rather than truncated. If this rounded
   * differently the preview would show one price and the document carry another,
   * which is the one way a preview can do harm.
   */
  const pence = (raw: string) => {
    const clean = raw.trim().replace(/[£,\s]/g, "");
    if (!clean) return 0;
    const pounds = Number(clean);
    if (!Number.isFinite(pounds) || pounds < 0) return 0;
    return Math.round(pounds * 100);
  };

  const wording = buildTerms(business, {
    setupFeePence: pence(setupFee),
    recurringPence: pence(recurring),
    period: (period === "quarterly" || period === "yearly" ? period : "monthly") as
      | "monthly"
      | "quarterly"
      | "yearly",
    trialEndsOn: /^\d{4}-\d{2}-\d{2}$/.test(trialEndsOn) ? trialEndsOn : null,
    noticeDays: (() => {
      const n = Math.round(Number(noticeDays));
      return Number.isFinite(n) && n >= 0 && n <= 365 ? n : 60;
    })(),
    includes: includes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6),
  });

  /*
   * Told upwards once, when it has actually gone.
   *
   * An effect rather than something derived, because the parent owns what
   * happens next and this is the one moment worth telling it about. Guarded on
   * sent.ok so it fires on success and not on an error.
   */
  useEffect(() => {
    if (sent.ok) onSent(sent);
    // Only when the outcome changes; onSent is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);

  return (
        <form action={sendAction} className="mt-4 space-y-3 border-t border-border pt-4">
          <input type="hidden" name="studio_id" value={studioId} />

          <label className="block">
            <span className="label">Send it to</span>
            <input
              name="sent_to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
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
              value={includes}
              onChange={(e) => setIncludes(e.target.value)}
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
              <input
                name="setup_fee"
                inputMode="decimal"
                value={setupFee}
                onChange={(e) => setSetupFee(e.target.value)}
                placeholder="0"
                className="input"
              />
            </label>
            <label className="block">
              <span className="label">Then £</span>
              <input
                name="recurring"
                inputMode="decimal"
                value={recurring}
                onChange={(e) => setRecurring(e.target.value)}
                placeholder="20"
                className="input"
              />
            </label>
            <label className="block">
              <span className="label">How often</span>
              <select
                name="period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="input"
              >
                <option value="monthly">a month</option>
                <option value="quarterly">a quarter</option>
                <option value="yearly">a year</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Free until</span>
              <input
                type="date"
                name="trial_ends_on"
                value={trialEndsOn}
                onChange={(e) => setTrialEndsOn(e.target.value)}
                className="input"
              />
              <span className="hint">Leave blank for no trial, which is the usual answer.</span>
            </label>
            <label className="block">
              <span className="label">Notice to cancel, days</span>
              <input
                name="notice_days"
                inputMode="numeric"
                value={noticeDays}
                onChange={(e) => setNoticeDays(e.target.value)}
                className="input"
              />
            </label>
          </div>

          {/*
            * The document itself, before it goes anywhere.
            *
            * Folded rather than always open: the common case is sending the same
            * shape of agreement you sent the last one, and two hundred lines of
            * terms above the button would bury it. Open it once for a new price
            * or a new kind of client, which is exactly when it matters.
            *
            * Rendered by buildTerms, which is what the action calls. Not a
            * preview of the wording - the wording.
            */}
          <details className="rounded-xl border border-border px-3.5 py-2.5">
            <summary className="cursor-pointer text-sm text-muted">
              Read it before you send it. Version {TERMS_VERSION}.
            </summary>
            <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-line rounded-lg bg-surface-2/60 p-3 text-[12.5px] leading-relaxed">
              {wording}
            </div>
            <p className="hint mt-2 max-w-prose">
              This is what gets written onto the agreement and frozen there. Change a
              figure above and it changes here. The clauses marked with a star are the
              ones worth a solicitor&rsquo;s hour.
            </p>
          </details>

          {amending && (
            <input type="hidden" name="replaces" value={amending.id} />
          )}

          <button type="submit" className="btn bg-accent px-4 py-2 text-on-accent">
            {amending ? "Replace it and email the new link" : "Build it and email the link"}
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
  );
}
