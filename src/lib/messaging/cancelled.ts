/**
 * Telling somebody their appointment is off.
 *
 * Nothing did. A booking cancelled in the diary set a column, dropped the
 * reminders and said nothing to the person who was coming; a booking
 * cancelled at the customer's own request did the same.
 *
 * Jess at Living Canvas asked to cancel twice on 18 October, once on the
 * website and once by email, and was told both times that somebody would
 * confirm it with her. Dave took it out of the diary by hand. Nobody ever
 * confirmed anything. From where she sits, four days later, she has no idea
 * whether she is expected on Saturday or not — and the only safe thing for
 * her to do is turn up or ring.
 *
 * So this is the other half of the confirmation. Same letterhead, same
 * business colour, same shape, and it goes out whoever did the cancelling:
 * the diary, the assistant, or the customer themselves.
 *
 * Never throws, never awaited by anything that matters. A cancellation that
 * happened is more important than the email saying so, and a failure here
 * must not leave the diary wrong.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmail, emailText } from "./emailTemplate";
import { sendEmail, emailConfigured } from "./email";
import { usableAddress } from "./address";
import { replyToFor } from "./replyTo";
import { avatarUrl } from "@/components/Avatar";

/** Who ended it, which changes one sentence and nothing else. */
export type CancelledBy = "them" | "the business";

function whenItWas(iso: string, timeZone: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(t))
    .replace(/:00(?=\s?[ap]m)/i, "")
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
}

export async function sendCancellationNotice(
  db: SupabaseClient,
  bookingId: string,
  by: CancelledBy,
): Promise<void> {
  try {
    if (!emailConfigured()) return;

    const { data: booking } = await db
      .from("bookings")
      .select("id, starts_at, enquiry_id, contact_id, deposit_amount_pence, deposit_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return;

    const { data: contact } = await db
      .from("contacts")
      .select("name, email, studio_id")
      .eq("id", booking.contact_id)
      .maybeSingle();

    /* No address, nothing to send to. Plenty of people are booked in over the
       counter and never give one; that is not a failure. */
    if (!contact?.email) return;

    const { data: studio } = await db
      .from("studios")
      .select("id, slug, name, email, timezone, widget_accent, photo_path")
      .eq("id", contact.studio_id)
      .maybeSingle();

    if (!studio) return;

    const was = whenItWas(booking.starts_at as string, (studio.timezone as string) ?? "Europe/London");
    const first = String(contact.name ?? "").trim().split(/\s+/)[0] || "there";

    /*
     * The deposit is named and nothing is promised about it.
     *
     * Whether money comes back is the business's decision and their policy,
     * and an email that says "you will be refunded" on their behalf is a
     * promise somebody else has to keep. Saying it is paid and that they will
     * be in touch is true, useful, and leaves the decision where it belongs.
     */
    const deposit =
      ((booking.deposit_amount_pence as number | null) ?? 0) > 0 &&
      booking.deposit_status === "paid"
        ? " You have a deposit paid against it, and the studio will be in touch about that."
        : "";

    const body =
      by === "them"
        ? `Hello ${first}, that is cancelled. You were in on ${was}, and you are not ` +
          `expected now.${deposit}

If you would like to come another time, just reply ` +
          `to this email and we will find you something.`
        : `Hello ${first}, we are sorry, we have had to cancel your appointment on ` +
          `${was}.${deposit}

Reply to this email and we will get you booked in again ` +
          `at a time that suits.`;

    /*
     * Both halves from the same parts, which is the point of emailText.
     *
     * It has sat in the builder unused since the day it was written, so every
     * message that bothered with a text part wrote its own by hand and the two
     * drifted. This one cannot drift: there is one body and two renderings of
     * it.
     */
    const parts = {
      business: studio.name as string,
      heading: "Your appointment is cancelled",
      body,
      details: [{ label: "Was", value: was }],
      photoUrl: avatarUrl(studio.photo_path as string | null),
      contactEmail: usableAddress((studio.email as string) ?? "") ?? null,
      accent: studio.widget_accent as string | null,
      replies: true,
    };

    await sendEmail({
      to: contact.email as string,
      subject: `Cancelled: ${was}`,
      text: emailText(parts),
      html: buildEmail(parts),
      fromName: studio.name as string,
      replyTo: replyToFor(studio as { slug: string; email: string | null }),
    });
  } catch (error) {
    console.error("[cancelled]", (error as Error).message);
  }
}
