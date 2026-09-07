import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTurn } from "@/lib/engine/run";
import { sendEmail, emailConfigured } from "@/lib/messaging/email";
import {
  judge,
  domainOf,
  addressOf,
  ourRecipient,
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

    await sendEmail({
      to: sender,
      subject: replySubject(email.subject),
      text: result.reply,
      fromName: studio.name,
      replyTo: studio.email ?? undefined,
    });

    return ok("answered");
  } catch {
    // The engine records what it can. Silence beats an error arriving in a
    // customer's inbox with the business's name on it.
    return ok("could not answer");
  }
}

/**
 * The provider's shape, read defensively.
 *
 * Written against Resend's inbound webhook, which nests the message under
 * `data`. Every field is read from more than one place because this is the one
 * piece of the system whose format belongs to somebody else — a rename at
 * their end should come out as "we could not read it" rather than as a
 * customer being quietly dropped.
 */
function readEmail(payload: Record<string, unknown>): InboundEmail | null {
  const data = ((payload.data as Record<string, unknown>) ?? payload) || {};

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = data[k] ?? payload[k];
      if (typeof v === "string" && v.trim()) return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
    }
    return null;
  };

  const rawHeaders = (data.headers ?? payload.headers) as unknown;
  const headers: Record<string, string> = {};

  if (Array.isArray(rawHeaders)) {
    for (const h of rawHeaders as { name?: string; value?: string }[]) {
      if (h?.name) headers[h.name.toLowerCase()] = String(h.value ?? "");
    }
  } else if (rawHeaders && typeof rawHeaders === "object") {
    for (const [k, v] of Object.entries(rawHeaders as Record<string, unknown>)) {
      headers[k.toLowerCase()] = String(v ?? "");
    }
  }

  const from = pick("from", "sender", "From");
  if (!from) return null;

  return {
    from,
    to: pick("to", "recipient", "To"),
    subject: pick("subject", "Subject"),
    /*
     * The words, whatever part they arrived in.
     *
     * A great deal of mail carries no plain-text part at all, and handing the
     * markup straight to the assistant means it reads a wall of tags and may
     * quote them back at a customer.
     */
    body: pick("text", "body", "plain") ?? flatten(pick("html")),
    headers,
  };
}

/** Markup down to words, or null if there was none. */
function flatten(html: string | null): string | null {
  if (!html) return null;
  const text = plainTextFrom(html);
  return text || null;
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

    if (error || !made) return;
    id = made.id;
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
