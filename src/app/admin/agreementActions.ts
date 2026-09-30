"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { hasColumn } from "@/lib/db/hasColumn";
import { siteOrigin } from "@/lib/origin";
import { sendEmail } from "@/lib/messaging/email";
import { buildEmail } from "@/lib/messaging/emailTemplate";
import { buildTerms, TERMS_VERSION, totalsFor, type Line, type Money } from "@/lib/agreements/terms";

/**
 * Sending a business its agreement, and withdrawing one.
 *
 * Giles, 27 Sep: "a way of sending in a contract for businesses I take on that
 * they can be sent and sign when I add them... payment will be set up fee then
 * subscription which I will input into system, 60 day notice period to cancel
 * etc, options for trial period etc, not just fixed but bespoke ways of
 * charging, websites, Second Pair etc. Also so I could have a business set up
 * just for a website."
 *
 * ── Bespoke by default ──────────────────────────────────────────────────────
 *
 * There are no plans or tiers here. Every figure comes off this form, per
 * agreement, because that is how these are actually sold: a set-up fee for one,
 * a trial for another, a website on its own for somebody who does not want an
 * assistant at all. A tier list would be a guess at a shape the business does
 * not have yet, and the first client who did not fit it would be a migration.
 *
 * ── What is frozen, and why it has to be ────────────────────────────────────
 *
 * The wording is built here, once, and written onto the row. Nothing reads the
 * template again afterwards. Editing lib/agreements/terms.ts next March changes
 * what the next business is sent and nothing whatever about what anybody has
 * already signed — which is the only reason a signature on one of these is worth
 * having. The version is stamped beside it so it is always answerable which
 * wording somebody agreed to without reading the whole thing back.
 */

export type AgreementResult = {
  ok?: true;
  error?: string;
  note?: string;
  /** The private link, handed back so it can be passed on by hand if wanted. */
  link?: string;
};

/*
 * Every action in this file runs as the service role, which ignores row-level
 * security. So each one begins by asking the server who is calling — the
 * session, not the page that rendered the button and not a hidden field.
 */
async function guard(): Promise<AgreementResult | null> {
  return (await isPlatformAdmin()) ? null : { error: "Not allowed." };
}

/** Said once, wherever the table is not there yet. */
const NOT_YET =
  "Agreements need the database update run first — 20260927180000_agreements.sql.";

/** Pounds as a reader writes them: £20, and £22.50 only when there are pence. */
const poundsFor = (pence: number) =>
  pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;

const PERIOD_WORD: Record<"monthly" | "quarterly" | "yearly", string> = {
  monthly: "a month",
  quarterly: "a quarter",
  yearly: "a year",
};

const missingTable = (message: string) => /relation|does not exist|schema cache/i.test(message);

const pence = (fd: FormData, key: string) => {
  /*
   * Typed in pounds, stored in pence.
   *
   * Everything about money in this product is an integer number of pence, for
   * the reason every system that got it wrong found out: £0.1 + £0.2 is not
   * £0.30 in binary floating point. Rounded rather than truncated, so 12.345
   * becomes 1235 rather than 1234.
   */
  const raw = String(fd.get(key) ?? "").trim().replace(/[£,\s]/g, "");
  if (!raw) return 0;
  const pounds = Number(raw);
  if (!Number.isFinite(pounds) || pounds < 0) return 0;
  return Math.round(pounds * 100);
};

/**
 * Create an agreement for a business and email them the link.
 *
 * The order matters and is the same rule the forms code follows: decide where it
 * is going before writing the row, so a failed send is never a sent agreement.
 */
export async function sendAgreement(
  _prev: AgreementResult,
  fd: FormData,
): Promise<AgreementResult> {
  const stop = await guard();
  if (stop) return stop;

  const studioId = String(fd.get("studio_id") ?? "").trim();
  if (!studioId) return { error: "Which business is this for?" };

  const to = String(fd.get("sent_to") ?? "").trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { error: "Put the email address it should go to." };
  }

  const db = createAdminClient();

  const { data: studio, error: se } = await db
    .from("studios")
    .select("id, name")
    .eq("id", studioId)
    .maybeSingle();
  if (se) return { error: se.message };
  if (!studio) return { error: "That business has gone." };

  /*
   * What they are buying, in the words it will be described in.
   *
   * Free text rather than an enum, on the form and in the column both: "the
   * assistant" and "a website" are the two today and the third will arrive
   * before anybody remembers to add it to a type. buildTerms reads whether there
   * is an assistant out of this list rather than out of a flag, which is what
   * stops a website-only agreement promising one.
   */
  const includes = String(fd.get("includes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (includes.length === 0) return { error: "Say what they are taking on." };

  const period = String(fd.get("period") ?? "monthly");
  if (period !== "monthly" && period !== "quarterly" && period !== "yearly") {
    return { error: "How often does it recur?" };
  }

  const trialRaw = String(fd.get("trial_ends_on") ?? "").trim();
  const trialEndsOn = /^\d{4}-\d{2}-\d{2}$/.test(trialRaw) ? trialRaw : null;

  const noticeDays = (() => {
    const n = Math.round(Number(String(fd.get("notice_days") ?? "60")));
    return Number.isFinite(n) && n >= 0 && n <= 365 ? n : 60;
  })();

  /*
   * ── The schedule, read back rather than trusted ───────────────────────────
   *
   * Giles, 30 Sep: "should really have separate lines to add services and costs."
   *
   * It arrives as JSON from a form, so every field is checked and anything that
   * is not a line is dropped rather than stored. This ends up inside a document
   * somebody signs: a price that came through as a string, or a period nobody
   * has heard of, would be frozen into it.
   *
   * Capped at twenty. There is no real agreement with more, and an uncapped list
   * from a form is an uncapped row in the database.
   */
  const schedule: Line[] = (() => {
    const raw = String(fd.get("lines") ?? "").trim();
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (l): l is Line =>
            Boolean(l) &&
            typeof (l as Line).what === "string" &&
            (l as Line).what.trim().length > 0 &&
            Number.isFinite((l as Line).pence) &&
            (l as Line).pence >= 0 &&
            ["once", "monthly", "quarterly", "yearly"].includes(String((l as Line).when)),
        )
        .map((l) => ({
          what: l.what.trim().slice(0, 120),
          pence: Math.round(l.pence),
          when: l.when,
        }))
        .slice(0, 20);
    } catch {
      /* Not JSON at all. A simple agreement with no schedule, or a stale form. */
      return [];
    }
  })();

  /*
   * Where there is a schedule the totals are its sums, worked out here rather
   * than taken from the form.
   *
   * The form shows them read-only and computes the same way, but the form is
   * advisory. If the two ever disagreed, the document would carry one figure in
   * its prose and another in the column the back office adds up - and the
   * document is the one somebody signed.
   */
  const money: Money = {
    ...(schedule.length ? { lines: schedule } : {}),
    ...(schedule.length
      ? totalsFor(schedule)
      : {
          setupFeePence: pence(fd, "setup_fee"),
          recurringPence: pence(fd, "recurring"),
          period,
        }),
    trialEndsOn,
    noticeDays,
    includes,
  };

  const terms = buildTerms(studio.name as string, money);
  const token = randomBytes(24).toString("base64url");
  const url = `${siteOrigin()}/a/${token}`;
  const now = new Date().toISOString();

  const { error: insert } = await db.from("agreements").insert({
    studio_id: studio.id,
    setup_fee_pence: money.setupFeePence,
    recurring_pence: money.recurringPence,
    period: money.period,
    trial_ends_on: money.trialEndsOn,
    includes: money.includes,
    notice_days: money.noticeDays,
    /*
     * The schedule, only where the column exists.
     *
     * The lines migration is run by hand like every other one, so naming this
     * column unconditionally would make every agreement fail to save until
     * somebody had run SQL. Guarded, it degrades to exactly what it did before:
     * the wording still carries the schedule in prose, because that is built
     * before this and frozen into terms_text.
     */
    ...(schedule.length && (await hasColumn(db, "agreements", "lines"))
      ? { lines: schedule }
      : {}),
    terms_version: TERMS_VERSION,
    terms_text: terms,
    token,
    sent_to: to,
    sent_at: now,
  });
  if (insert) return { error: missingTable(insert.message) ? NOT_YET : insert.message };

  /*
   * ── Replacing one that has not been signed ────────────────────────────────
   *
   * Giles, 30 Sep: "you can't preview, amend etc." Amending is this: the old one
   * is withdrawn and this new one stands in its place.
   *
   * Deliberately not an edit. The wording on an agreement is frozen at the
   * moment it is sent, and that freeze is the only reason a signature on one
   * means anything - so a document cannot be changed, only superseded. What the
   * screen saves is the retyping, not the principle.
   *
   * Done after the new one exists rather than before, and refused on anything
   * signed. The order matters: withdrawing first and then failing to insert
   * would leave a business with a dead link and nothing to replace it, and they
   * would find out by pressing it.
   */
  const replaces = String(fd.get("replaces") ?? "").trim();
  if (replaces) {
    const { data: gone, error: withdrew } = await db
      .from("agreements")
      .update({ void_at: now, updated_at: now })
      .eq("id", replaces)
      .eq("studio_id", studio.id)
      .is("signed_at", null)
      .select("id");

    if (withdrew) {
      return {
        ok: true,
        link: url,
        note: `Sent the new one, but could not withdraw the old: ${withdrew.message}. Both links work - withdraw the old one by hand.`,
      };
    }
    if (!gone?.length) {
      /*
       * Nothing matched, which means it was signed, already withdrawn, or
       * belongs to another business. Said rather than swallowed: two live links
       * to two different sets of terms is exactly the confusion this feature is
       * meant to remove.
       */
      return {
        ok: true,
        link: url,
        note: "Sent the new one. The old one was not withdrawn, because it has been signed or was already withdrawn - so both links still open.",
      };
    }
  }

  /*
   * The email, sent directly rather than through `deliver`.
   *
   * deliver is for messages to a business's own customers: it checks their
   * marketing consent, their STOP list and the twenty-four hour window on the
   * Meta channels, none of which has anything to say about us emailing somebody
   * we have just agreed terms with. It also writes into that business's
   * conversation, and this is not one of their conversations.
   */
  /*
   * ── The link as a button, not as a line of text ────────────────────────────
   *
   * Giles, 30 Sep: "the link in the agreement email is not clickable."
   *
   * It was not. buildEmail takes an `action` and I passed it a body with a bare
   * URL sitting in the middle of it - so the HTML version rendered that URL as
   * plain text, exactly as typed, and the one thing the email exists to do could
   * not be done by pressing it. Every other email this product sends already
   * gets a button; this one was written by hand and missed it.
   *
   * The URL stays in the text version, because a plain-text email has no buttons
   * and a bare link is what a mail client makes clickable there. It comes out of
   * the HTML version, where the button is doing that job and the same address
   * twice reads as a mistake.
   */
  const body = [
    `Hello,`,
    ``,
    `Here is the agreement for ${studio.name}, ready to read and sign.`,
    ``,
    `It sets out what you are taking on, what it costs, how much notice either of us gives to end it, and what happens to your customers' information. Have a proper read, and if anything is not what we discussed, tell me and I will change it and send it again rather than asking you to sign it as it is.`,
    ``,
    `The link is yours to keep. Once it is signed it becomes your copy, and it does not change.`,
    ``,
    `Giles`,
    `Second Pair Ltd`,
  ].join("\n");

  const sent = await sendEmail({
    to,
    subject: `Your agreement with Second Pair, ${studio.name}`,
    /* Plain text keeps the address, because there is nothing to press. */
    text: `${body}\n\n${url}`,
    html: buildEmail({
      business: "Second Pair",
      heading: "Your agreement, ready to sign",
      body,
      action: { label: "Read it and sign it", url },
      /*
       * The money, where a reader's eye finds it without reading a sentence.
       *
       * The same argument the reminder emails make: the prose sounds like a
       * person, and the table is what somebody actually checks. Here it is what
       * they check before deciding whether to press the button at all.
       */
      details: [
        {
          label: "Setting up",
          value: money.setupFeePence > 0 ? poundsFor(money.setupFeePence) : "nothing",
        },
        {
          label: "Then",
          value: `${poundsFor(money.recurringPence)} ${PERIOD_WORD[money.period]}`,
        },
        { label: "Notice to cancel", value: `${money.noticeDays} days` },
        ...(money.trialEndsOn ? [{ label: "Free until", value: money.trialEndsOn }] : []),
      ],
    }),
    fromName: "Second Pair",
  });

  /*
   * A send that failed leaves the agreement in place, and says so.
   *
   * Deleting it would be worse: the row is the thing with the wording frozen on
   * it, and the link works perfectly well whether or not the email arrived. So
   * the honest outcome is "it exists, here is the link, the email did not go" —
   * which is something Giles can act on by pasting it into a text.
   */
  if (sent.status === "failed") {
    return {
      ok: true,
      link: url,
      note: `Made it, but the email did not send (${sent.error ?? "no reason given"}). The link works — send it by hand.`,
    };
  }

  revalidatePath("/admin");
  return { ok: true, link: url, note: `Sent to ${to}.` };
}

/**
 * Withdraw an agreement that has not been signed.
 *
 * A signed one is never withdrawn, and that is a refusal rather than an
 * oversight: it is the record of what somebody put their name to, and the way to
 * change what was agreed is a new agreement, not the quiet disappearance of the
 * old one. The consent form refuses the same thing for the same reason.
 */
export async function voidAgreement(
  _prev: AgreementResult,
  fd: FormData,
): Promise<AgreementResult> {
  const stop = await guard();
  if (stop) return stop;

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "Which one?" };

  const db = createAdminClient();
  const { data, error } = await db
    .from("agreements")
    .update({ void_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("signed_at", null)
    .select("id");

  if (error) return { error: missingTable(error.message) ? NOT_YET : error.message };
  if (!data?.length) {
    return {
      error:
        "A signed agreement cannot be withdrawn. It is the record of what they agreed — send a new one instead.",
    };
  }

  revalidatePath("/admin");
  return { ok: true, note: "Withdrawn. The link no longer opens." };
}

/**
 * Record that notice has been given, and work out the day it runs to.
 *
 * The end date is written down rather than worked out on every read, because the
 * notice period is a term of that agreement: changing the default later must not
 * silently move a date somebody has already been given.
 */
export async function giveNotice(
  _prev: AgreementResult,
  fd: FormData,
): Promise<AgreementResult> {
  const stop = await guard();
  if (stop) return stop;

  const id = String(fd.get("id") ?? "").trim();
  const on = String(fd.get("notice_given_on") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { error: "What date was notice given?" };

  const db = createAdminClient();
  const { data: agreement, error: read } = await db
    .from("agreements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (read) return { error: missingTable(read.message) ? NOT_YET : read.message };
  if (!agreement) return { error: "That agreement has gone." };

  const days = Number(agreement.notice_days ?? 60);
  const ends = new Date(`${on}T12:00:00Z`);
  ends.setUTCDate(ends.getUTCDate() + (Number.isFinite(days) ? days : 60));

  const { error } = await db
    .from("agreements")
    .update({
      notice_given_on: on,
      ends_on: ends.toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: `Noted. It runs to ${ends.toISOString().slice(0, 10)}.` };
}
