import type { SupabaseClient } from "@supabase/supabase-js";
import { isOptedOut } from "./optOut.ts";
import type { Channel } from "@/lib/types";
import { withinWindow as isWithinWindow, WINDOWED } from "./reach";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { sendMeta } from "./meta";

/**
 * Getting a message to a customer.
 *
 * One function per channel behind one call, so everything that wants to reach
 * somebody — a reply, an offer of a cancelled slot, a reminder — goes through
 * the same place and gets the same honesty about whether it arrived.
 *
 * Nothing here pretends. A channel that is not connected returns `failed` with
 * a reason a human can read, rather than reporting success and going nowhere,
 * which is how an owner ends up thinking they have replied when they have not.
 */

export type DeliveryStatus =
  | "not_needed"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "outside_window";

export type Delivery = {
  status: DeliveryStatus;
  /** Shown to the owner when something did not go. Plain English. */
  error?: string;
  /** The platform's own id, for chasing a delivery report later. */
  externalId?: string;
};

// The window rule lives with the question it answers — whether this person can
// be reached — so there is one copy of it and it can be tested on its own.
export { withinWindow, WINDOWED as NEEDS_WINDOW } from "./reach";

import { asEmail } from "./asEmail.ts";



export async function deliver({
  channel,
  to,
  body,
  lastInboundAt,
  subject,
  html,
  fromName,
  replyTo,
  from,
  metaAccountId,
  metaToken,
  reachOn,
  db,
  studioId,
  transactional = false,
}: {
  channel: Channel;
  /** Phone number, page-scoped id, or the widget session — whatever the channel addresses. */
  to: string | null;
  body: string;
  /** When the customer last messaged, which decides the 24-hour window. */
  lastInboundAt?: string | null;
  /** Email only. Everything else is a chat message and has no subject. */
  subject?: string;
  /**
   * Email only: the same message, laid out.
   *
   * Optional, and text is still always sent alongside it — some people read
   * mail as plain text and so do spam filters. A caller that has nothing to
   * say about the look passes nothing and gets what it always got.
   */
  html?: string;
  /** The business's name, so an email does not look like it came from us. */
  fromName?: string;
  /** Where a reply should go. The business, not us. */
  replyTo?: string;
  /** Text messages: the business's own number, when it has one. */
  from?: string | null;
  /**
   * Meta channels: the account the message goes out from, and the token that
   * lets us send as it.
   *
   * Both come from the connection this conversation arrived on, and the token
   * lives in a table only the server can read. Absent means the channel is not
   * connected, which is a different answer from "it failed" and is said
   * differently below.
   */
  /**
   * Who is sending, so a text can be checked against their STOP list.
   *
   * Somebody who texts STOP is recorded — and until now the only thing that
   * read that record was the reminder sweep. Every other text went out
   * regardless: the owner's own message, a form link, a quote, a held reply
   * answered in the morning, a missed call. Passing these two makes the check
   * happen here, which is the one place every text in the product goes
   * through.
   *
   * Optional only so a caller that genuinely has neither — a test, a send
   * before a studio is known — still compiles. When they are absent the check
   * cannot run, and that is said in the result rather than assumed safe.
   */
  db?: Pick<SupabaseClient, "from">;
  studioId?: string | null;
  /**
   * True for a message about something they asked for: a booking they just
   * made, a form they are waiting on, a payment link they requested. Those are
   * service messages and STOP does not silence them — STOP is about marketing
   * and about not being pestered, not about losing the confirmation for an
   * appointment tomorrow.
   */
  transactional?: boolean;
  metaAccountId?: string | null;
  metaToken?: string | null;
  /**
   * How to reach somebody who asked through the website.
   *
   * They are not sitting in the widget waiting — they closed the tab. This is
   * whatever the assistant managed to collect while it was talking to them.
   */
  reachOn?: {
    phone?: string | null;
    email?: string | null;
    /** Who it is going to, so an email can greet them by name. */
    firstName?: string | null;
  } | null;
}): Promise<Delivery> {
  if (!body.trim()) return { status: "failed", error: "Nothing to send." };

  /*
   * A reply to a widget enquiry has to leave the widget.
   *
   * This returned "not needed", on the reasoning that the customer reads it in
   * the chat window. They do not. They asked a question on a Tuesday evening,
   * closed the tab, and are waiting to hear back — the owner types a reply the
   * next morning, sees it appear in the thread, and it reaches nobody at all.
   * Of every channel this is the one where the person is least likely to still
   * be looking, and it was the only one that sent nothing.
   *
   * So it goes wherever they can actually be reached, cheapest first: a text
   * costs pennies and is read, an email costs nothing and is read later. What
   * it must never do is claim to have sent something when there is nowhere to
   * send it.
   */
  if (channel === "web") {
    if (reachOn?.phone) {
      const texted = await sendSms({ to: reachOn.phone, body, from });
      // Falling through to email on failure, because a customer who cannot be
      // texted can very often still be emailed.
      if (texted.status === "sent") return texted;
    }

    if (reachOn?.email) {
      /*
       * Dressed as an email rather than posted as a chat message.
       *
       * The words are written once and go wherever somebody can be reached,
       * which is right — four versions of "we can do Thursday at two" is how
       * three of them go stale. But the same words in an inbox with no
       * greeting, no sign-off and a subject reading "Message from Willow & Co"
       * arrive looking like a text that has wandered in, and read as a mail
       * filter's idea of junk.
       */
      const letter = asEmail({
        body,
        businessName: fromName ?? "",
        firstName: reachOn.firstName,
        canReply: Boolean(replyTo),
        about: subject,
      });

      return sendEmail({
        to: reachOn.email,
        subject: letter.subject,
        text: letter.text,
        html,
        fromName,
        replyTo,
      });
    }

    return {
      status: "failed",
      error:
        "They asked through the website and left no phone number or email, so there is " +
        "no way to reach them. It is saved here in case they come back.",
    };
  }

  if (!to) {
    return {
      status: "failed",
      error: "No address for this channel, so there is nothing to send it to.",
    };
  }

  if (WINDOWED.includes(channel) && !isWithinWindow(lastInboundAt)) {
    return {
      status: "outside_window",
      error:
        channel === "instagram"
          ? "Instagram only allows a reply within 24 hours of their last message. They will have to message again first."
          : "Meta only allows a free reply within 24 hours. After that it has to be one of their approved templates.",
    };
  }

  switch (channel) {
    case "whatsapp":
    case "messenger":
    case "instagram":
      /*
       * Connected per business, not globally.
       *
       * One business can have WhatsApp linked while the next has not, so
       * "connected" is a question about this conversation rather than about
       * the platform. No token means this business has not linked it.
       */
      if (!metaAccountId || !metaToken) {
        return notConnected(
          channel === "instagram" ? "Instagram" : channel === "whatsapp" ? "WhatsApp" : "Messenger",
          "this business has not linked their account yet",
        );
      }
      return sendMeta({
        channel,
        accountId: metaAccountId,
        personId: to,
        token: metaToken,
        body,
      });

    case "sms": {
      /*
       * Not to somebody who has said stop.
       *
       * Checked here rather than at each caller, because "every text" is what
       * the promise means and the callers are six files apart. A message about
       * something they asked for still goes: see `transactional`.
       */
      if (db && studioId && !transactional && (await isOptedOut(db, studioId, to))) {
        return {
          status: "not_needed",
          error: "they have texted STOP, so nothing was sent",
        };
      }

      return sendSms({ to, body, from });
    }

    case "email": {
      // The same envelope as the widget's email fallback above, for the same
      // reason: one of these is a reply to somebody who wrote in by email, and
      // it was going out looking even more like a text than the other.
      const letter = asEmail({
        body,
        businessName: fromName ?? "",
        firstName: reachOn?.firstName,
        canReply: Boolean(replyTo),
        about: subject,
      });

      return sendEmail({
        to,
        subject: letter.subject,
        text: letter.text,
        html,
        fromName,
        replyTo,
      });
    }

    case "voice":
      return { status: "failed", error: "You cannot send a message down a phone call." };

    default:
      return { status: "failed", error: "That channel is not one we send on." };
  }
}

/**
 * A channel that will exist but does not yet.
 *
 * Deliberately a failure rather than a queue: queuing implies it will go on
 * its own later, and a message sitting in a queue nobody is draining is a
 * customer nobody answered.
 */
function notConnected(what: string, why: string): Delivery {
  return {
    status: "failed",
    error: `Not connected: ${why}. Your reply is saved here but ${what} has not received it.`,
  };
}

/** Records what happened, so the thread shows the truth rather than a hope. */
export async function recordDelivery(
  db: SupabaseClient,
  messageId: string,
  result: Delivery,
): Promise<void> {
  await db
    .from("messages")
    .update({
      delivery: result.status,
      delivered_at:
        result.status === "sent" || result.status === "delivered"
          ? new Date().toISOString()
          : null,
      delivery_error: result.error ?? null,
      external_id: result.externalId ?? null,
    })
    .eq("id", messageId);
}
