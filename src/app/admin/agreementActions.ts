"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { siteOrigin } from "@/lib/origin";
import { sendEmail } from "@/lib/messaging/email";
import { buildEmail } from "@/lib/messaging/emailTemplate";
import { buildTerms, TERMS_VERSION, type Money } from "@/lib/agreements/terms";

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

  const money: Money = {
    setupFeePence: pence(fd, "setup_fee"),
    recurringPence: pence(fd, "recurring"),
    period,
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
    terms_version: TERMS_VERSION,
    terms_text: terms,
    token,
    sent_to: to,
    sent_at: now,
  });
  if (insert) return { error: missingTable(insert.message) ? NOT_YET : insert.message };

  /*
   * The email, sent directly rather than through `deliver`.
   *
   * deliver is for messages to a business's own customers: it checks their
   * marketing consent, their STOP list and the twenty-four hour window on the
   * Meta channels, none of which has anything to say about us emailing somebody
   * we have just agreed terms with. It also writes into that business's
   * conversation, and this is not one of their conversations.
   */
  const body = [
    `Hello,`,
    ``,
    `Here is the agreement for ${studio.name}, ready to read and sign:`,
    ``,
    url,
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
    subject: `Your agreement with Second Pair — ${studio.name}`,
    text: body,
    html: buildEmail({ business: "Second Pair", body }),
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
