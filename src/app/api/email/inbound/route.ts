import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTurn } from "@/lib/engine/run";
import { sendEmail, emailConfigured, fetchReceivedEmail } from "@/lib/messaging/email";
import {
  judge,
  domainOf,
  addressOf,
  ourRecipient,
  readEmail,
  plainTextFrom,
  type InboundEmail,
} from "@/lib/messaging/inboundEmail";
import { hasAnthropicEnv } from "@/lib/env";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * An email arriving.
 *
 * The address is ours — <slug>@in.second-pair.com — and a business points its
 * enquiry address at it. That choice does most of the safety work on its own:
 * we never hold the keys to anybody's mailbox, and we never see a word that
 * was not deliberately sent here.
 *
 * The rest is done by judging what arrives, because forwarding an enquiry
 * address forwards everything sent to it — the wholesaler, the accountant,
 * four newsletters and the spam. See inboundEmail: answered only when it reads
 * as a person getting in touch, put in the inbox unanswered when it is a
 * person we should not write to, and left entirely alone when it is a machine.
 *
 * Always 200, whatever happens. A mail provider retries a failure, and a retry
 * of an email we have already answered is a second reply to the same customer.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;

  /*
   * A shared secret, because anybody who can post here can put words in a
   * customer's mouth. With none set nothing is accepted at all — an open
   * endpoint that makes the assistant write to strangers is not something to
   * leave lying around while it is "not set up yet".
   */
  if (!secret) return ok("not configured");

  const given =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("key");

  if (!sameSecret(given, secret)) {
    return new NextResponse("Not authorised", { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return ok("unreadable");

  const email = readEmail(payload);
  if (!email?.from || !email.to) return ok("nothing to read");

  /*
   * The envelope arrived; now go and get the letter.
   *
   * Resend posts metadata only and keeps the message behind an id. Everything
   * downstream — whether this is a person or a newsletter, what they actually
   * asked — depends on having the words, so this happens before any of it.
   *
   * Only when the body is genuinely absent, so a provider that does send one
   * costs nothing, and so this keeps working unchanged if Resend starts
   * including it.
   */
  const emailId = receivedId(payload);
  if (!email.body?.trim() && emailId) {
    const full = await fetchReceivedEmail(emailId);
    if (full) {
      email.body = full.text?.trim() || (full.html ? plainTextFrom(full.html) : null);
      // Merged rather than replaced: the webhook may have carried some, and
      // the fetched set is the more complete of the two.
      email.headers = { ...(email.headers ?? {}), ...full.headers };
    }
  }

  const db = createAdminClient();

  /*
   * Which business it was sent to. The local part is the slug, so an address
   * cannot be confused with another business's and there is no second table to
   * keep in step.
   */
  const ourDomain = (process.env.EMAIL_INBOUND_DOMAIN ?? "in.second-pair.com").toLowerCase();
  const mine = ourRecipient(email.to, ourDomain);
  const slug = mine?.split("@")[0]?.trim();
  if (!slug) return ok("no business in the address");

  const { data: studio } = await db
    .from("studios")
    .select("id, slug, name, email, archived_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!studio || studio.archived_at) return ok("no such business");

  const verdict = judge(email, {
    ownDomains: [studio.email ? domainOf(studio.email) : ""].filter(Boolean),
    ourDomain: (process.env.EMAIL_FROM ?? "").split("@")[1] ?? "second-pair.com",
  });

  // A machine talking. Nothing is written down, because a newsletter landing
  // in the inbox every Tuesday makes the inbox worth less than it was.
  if (verdict.what === "ignore") return ok(`ignored: ${verdict.because}`);

  const sender = addressOf(email.from);

  if (verdict.what === "park") {
    await park(db, studio.id, sender, email, verdict.because);
    return ok(`parked: ${verdict.because}`);
  }

  if (!hasAnthropicEnv() || !emailConfigured()) {
    await park(db, studio.id, sender, email, "the assistant cannot send email yet");
    return ok("parked, not configured to answer");
  }

  /*
   * A subject line is not an enquiry.
   *
   * Resend's own payload reference says the webhook carries metadata only —
   * "webhooks do not include the email body" — while its blog says the
   * opposite, so which arrives is not something to find out by guessing. If
   * the words are missing, answering anyway means replying to somebody based
   * on nothing but "Re: quote?", which is worse than not answering: it is the
   * business looking like it did not read the email.
   *
   * Parked instead. It lands in the inbox with whatever did arrive, a person
   * sees it, and the reason is written down where it can be acted on.
   */
  if (!email.body?.trim()) {
    await park(db, studio.id, sender, email, "the message itself could not be fetched");
    return ok("parked: no body, and it could not be fetched");
  }

  const said = [email.subject, email.body].filter(Boolean).join("\n\n").trim();

  try {
    const result = await runTurn({
      studioSlug: studio.slug,
      // Their address is the thread, the way a phone number is on a text.
      sessionKey: sender,
      channel: "email",
      origin: request.nextUrl.origin,
      message: said || "(an empty message)",
    });

    if (result.paused || !result.reply) return ok("handed over");

    const sent = await sendEmail({
      to: sender,
      subject: replySubject(email.subject),
      text: result.reply,
      fromName: studio.name,
      replyTo: studio.email ?? undefined,
    });

    /*
     * Whether it actually went.
     *
     * sendEmail does not throw — it returns a failure — and this ignored what
     * came back and reported "answered" either way. So a reply that never left
     * the building looked identical to one that arrived: the webhook log said
     * answered, the thread showed the assistant's message sitting there, and
     * the customer got nothing at all. Somebody emails in, the dashboard says
     * they were dealt with, and they are still waiting.
     *
     * Written on the thread, because "did they ever get an answer?" is asked
     * days later and the only honest answer is one recorded at the time. Said
     * in the webhook response too, since that is the one place a provider's own
     * delivery log will show it back.
     */
    if (sent.status !== "sent") {
      await db.from("messages").insert({
        conversation_id: result.conversationId,
        role: "system",
        content: `The reply could not be emailed to ${sender}: ${sent.error}`,
      });

      await db
        .from("conversations")
        .update({ status: "needs_human" })
        .eq("id", result.conversationId);

      return ok(`answered, but the reply would not send: ${sent.error}`);
    }

    return ok("answered");
  } catch {
    // The engine records what it can. Silence beats an error arriving in a
    // customer's inbox with the business's name on it.
    return ok("could not answer");
  }
}


/**
 * The id the message is stored under, so the words can be fetched.
 *
 * Read from several places for the same reason everything else here is: the
 * shape belongs to Resend, and a rename at their end should come out as a
 * parked email rather than a customer never being answered.
 */
function receivedId(payload: Record<string, unknown>): string | null {
  const data = (payload.data as Record<string, unknown>) ?? payload;
  for (const key of ["email_id", "id", "message_id"]) {
    const v = data?.[key] ?? payload[key];
    // A Message-ID is the mail header, not a Resend id, and cannot be fetched.
    if (typeof v === "string" && v.trim() && !v.includes("@")) return v.trim();
  }
  return null;
}

/** "Re:" once, however many times it has been round already. */
function replySubject(subject: string | null | undefined): string {
  const clean = (subject ?? "").replace(/^((re|fwd?)\s*:\s*)+/i, "").trim();
  return clean ? `Re: ${clean}` : "Re: your message";
}

/**
 * In the inbox, unanswered.
 *
 * For the ones where a person wrote but a reply would be wrong. The owner sees
 * it and decides, which is the point of parking rather than guessing.
 */
async function park(
  db: ReturnType<typeof createAdminClient>,
  studioId: string,
  sender: string,
  email: InboundEmail,
  because: string,
) {
  const { data: existing } = await db
    .from("conversations")
    .select("id")
    .eq("studio_id", studioId)
    .eq("channel", "email")
    .eq("external_ref", sender)
    .limit(1)
    .maybeSingle();

  let id = existing?.id ?? null;

  if (!id) {
    const { data: contact } = await db
      .from("contacts")
      .insert({ studio_id: studioId, channel: "email", email: sender })
      .select("id")
      .single();

    const { data: made, error } = await db
      .from("conversations")
      .insert({
        studio_id: studioId,
        contact_id: contact?.id ?? null,
        channel: "email",
        external_ref: sender,
        status: "needs_human",
      })
      .select("id")
      .single();

    /*
     * Somebody else started the thread while this one was being written.
     *
     * Two emails from the same person arriving together, or a provider
     * retrying one it thought had failed. Returning here dropped the second
     * message entirely — no reply, no record, nothing for the owner to notice
     * was missing, which is the worst way for a customer's words to be lost.
     */
    id = made?.id ?? null;

    if (!id) {
      const { data: theirs } = await db
        .from("conversations")
        .select("id")
        .eq("studio_id", studioId)
        .eq("channel", "email")
        .eq("external_ref", sender)
        .limit(1)
        .maybeSingle();

      if (!theirs) return;

      // The contact made a moment ago has nothing pointing at it.
      if (contact?.id) await db.from("contacts").delete().eq("id", contact.id);
      id = theirs.id;
    }

    if (error && !id) return;
  }

  await db.from("messages").insert({
    conversation_id: id,
    role: "client",
    content: [email.subject, email.body].filter(Boolean).join("\n\n") || "(an empty message)",
  });

  await db.from("messages").insert({
    conversation_id: id,
    role: "system",
    content: `Not answered automatically — ${because}.`,
  });

  await db.from("conversations").update({ status: "needs_human" }).eq("id", id);
}

function ok(note: string) {
  return NextResponse.json({ ok: true, note });
}

/**
 * Compared without leaking how much of it was right.
 *
 * A plain !== returns as soon as two characters differ, so how long it takes
 * says something about how close a guess was. Not a practical attack over the
 * internet against a long secret, but the text webhook next door already does
 * this properly and there is no reason for the two to disagree.
 */
function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on differing lengths, and a length is not a secret.
  return a.length === b.length && timingSafeEqual(a, b);
}
