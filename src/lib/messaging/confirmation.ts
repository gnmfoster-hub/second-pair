import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, with extensions, so the composing half below can be loaded and
// tested by node directly. The rest of the codebase uses the @/ alias.
import { sendEmail, emailConfigured } from "./email.ts";
import { replyToFor } from "./replyTo.ts";
import { usableAddress } from "./address.ts";
import { buildCalendar } from "../ics.ts";
import { formatPence } from "../money.ts";
import { buildEmail } from "./emailTemplate.ts";

/**
 * The email a customer gets when their booking is confirmed.
 *
 * This is what email is actually for. A reminder has to be read now, which is
 * SMS's job; a confirmation has to be findable in three weeks when they cannot
 * remember whether it was Tuesday or Wednesday. Email is where people look for
 * that, and the calendar file attached means most of them never have to.
 *
 * Nothing in here is allowed to throw. It is called from the Stripe webhook,
 * and a webhook that fails gets retried — which would take the payment again
 * in effect, or at least log a failure against a booking that is perfectly
 * fine. A confirmation that did not send is worth recording, not worth
 * unwinding a payment over.
 */
export async function sendBookingConfirmation(
  db: SupabaseClient,
  bookingId: string,
): Promise<void> {
  try {
    if (!emailConfigured()) return;

    /*
     * Three small queries rather than one deep one.
     *
     * PostgREST will do the whole join, but the types give up several levels
     * down and the result comes back as an error shape. This is a webhook,
     * not a hot path, and being able to read it matters more.
     */
    const { data: booking } = await db
      .from("bookings")
      .select(
        "id, starts_at, ends_at, type, deposit_amount_pence, enquiry_id, updated_at, artists(name)",
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return;

    const { data: enquiry } = await db
      .from("enquiries")
      .select("conversation_id")
      .eq("id", booking.enquiry_id)
      .maybeSingle();

    if (!enquiry?.conversation_id) return;

    const { data: conversation } = await db
      .from("conversations")
      .select(
        "id, contacts(name, email), studios(slug, name, email, timezone, cancellation_policy, widget_accent)",
      )
      .eq("id", enquiry.conversation_id)
      .maybeSingle();

    // PostgREST returns an object for a to-one join, not an array. Reading
    // these as arrays is how the figures on the inbox once came out as zero.
    const contact = conversation?.contacts as unknown as {
      name: string | null;
      email: string | null;
    } | null;
    const studio = conversation?.studios as unknown as {
      slug: string;
      name: string;
      email: string | null;
      widget_accent: string | null;
      timezone: string;
      cancellation_policy: string | null;
    } | null;
    const artist = (booking.artists as unknown as { name: string } | null)?.name;

    // No address, nothing to send to. Not a failure — plenty of people book
    // over Instagram and never give one.
    if (!contact?.email || !studio) return;

    const { subject, text, html, calendar } = composeConfirmation({
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      type: booking.type,
      depositPence: booking.deposit_amount_pence,
      contactName: contact.name,
      artistName: artist ?? null,
      studioName: studio.name,
      timezone: studio.timezone ?? "Europe/London",
      cancellationPolicy: studio.cancellation_policy,
      bookingId: booking.id,
      updatedAt: booking.updated_at ?? null,
      contactEmail: usableAddress(studio.email ?? "") ?? null,
      accent: studio.widget_accent ?? null,
    });

    const result = await sendEmail({
      to: contact.email,
      subject,
      text,
      html,
      fromName: studio.name,
      replyTo: replyToFor(studio),
      attachments: [
        {
          filename: "appointment.ics",
          content: Buffer.from(calendar, "utf8").toString("base64"),
          contentType: "text/calendar",
        },
      ],
    });

    /*
     * And noted where the "Is it working?" page can count it.
     *
     * That page told nine businesses out of ten "you have no confirmation
     * written, so nobody is told their booking is in", and it was untrue for
     * every one of them. It counts confirmations by joining the reminders
     * table to a template timed at nought hours — and this email is not a
     * reminder and uses no template. It is built in, it carries the calendar
     * file, and it goes on every booking that needs no deposit.
     *
     * So the product reported that nobody was being confirmed while it was
     * confirming them. Found when Giles asked what else on that screen might
     * be claiming something nothing had checked.
     *
     * The same claim table reviews and campaigns use, keyed on the booking so
     * a resend cannot count twice. Failure ignored on purpose: a confirmation
     * that went matters more than the note saying it did.
     */
    if (result.status === "sent") {
      await db
        .from("handled_messages")
        .insert({
          message_id: `confirm:${bookingId}`,
          channel: "email",
          /* Looked up by slug: the conversation row here does not carry the
             id, and a claim without one cannot be counted per business. */
          studio_id:
            (
              await db
                .from("studios")
                .select("id")
                .eq("slug", studio.slug)
                .maybeSingle()
            ).data?.id ?? null,
        })
        .then(
          () => undefined,
          () => undefined,
        );
    }

    /*
     * Written into the thread either way.
     *
     * "Did they get a confirmation?" is a question somebody asks weeks later,
     * and the only honest answer is one that was recorded at the time.
     */
    if (conversation?.id) {
      await db.from("messages").insert({
        conversation_id: conversation.id,
        role: "system",
        content:
          result.status === "sent"
            ? `Confirmation emailed to ${contact.email}.`
            : `Confirmation could not be emailed to ${contact.email}: ${result.error}`,
      });
    }
  } catch {
    // Swallowed on purpose. See the note at the top: this must never be the
    // reason Stripe retries a webhook for a booking that is already paid for.
  }
}

/**
 * The words and the calendar file, with nothing that touches the network.
 *
 * Separated so it can be tested. The date is the part that matters: it has to
 * be the time the customer will actually turn up, in the salon's timezone,
 * which in Britain means an hour's difference for seven months of the year.
 */
export function composeConfirmation({
  startsAt,
  endsAt,
  type,
  depositPence,
  contactName,
  artistName,
  studioName,
  timezone,
  cancellationPolicy,
  bookingId,
  updatedAt,
  contactEmail,
  accent,
}: {
  startsAt: string;
  endsAt: string;
  type: string;
  depositPence: number;
  contactName: string | null;
  artistName: string | null;
  studioName: string;
  timezone: string;
  cancellationPolicy: string | null;
  bookingId: string;
  /**
   * When the booking last changed, so a second copy of this file wins over the
   * first. Without it a moved appointment can be ignored by the customer's
   * calendar, which then still shows the old time.
   */
  updatedAt?: string | null;
  /**
   * The business's own public address, for the foot of the letter.
   *
   * Not the reply-to, which points at our inbound domain so the assistant can
   * carry an email conversation on. Printing that at a customer is what this
   * field exists to avoid.
   */
  contactEmail?: string | null;
  /** The business's own colour, as they chose it for the widget. */
  accent?: string | null;
}): { subject: string; text: string; html: string; calendar: string } {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);

  const when = starts.toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    // "3:00 pm", not "15:00". This is read by somebody standing in a queue,
    // and a 24-hour clock is one more thing to translate.
    hour12: true,
  });

  const firstName = contactName?.split(" ")[0] ?? "there";
  const deposit = depositPence
    ? `

Your deposit of ${formatPence(depositPence)} has been received, and comes off the total on the day.`
    : "";
  const policy = cancellationPolicy ? `

${cancellationPolicy}` : "";

  const text =
    `Hello ${firstName},

` +
    `You are booked in with ${artistName ?? studioName} on ${when}.` +
    deposit +
    policy +
    `

The appointment is attached, so you can add it to your calendar.` +
    `

${studioName}`;

  /*
   * A stable uid off the booking id, so if this is ever sent twice their
   * calendar updates the same entry rather than showing two.
   */
  const calendar = buildCalendar({
    name: studioName,
    events: [
      {
        uid: `booking-${bookingId}@second-pair.com`,
        starts,
        ends,
        summary: `${studioName}${artistName ? ` with ${artistName}` : ""}`,
        description: type === "consultation" ? "Consultation" : undefined,
        updated: updatedAt ? new Date(updatedAt) : undefined,
      },
    ],
  });

  /*
   * The same thing, drawn.
   *
   * This is the most-sent customer-facing email in the product and it has
   * always gone out as four lines of plain text, so it arrived looking like
   * a note from a stranger rather than from the business they just booked
   * with. Giles, 16 October: "the emails are all just boring text."
   *
   * The detail goes in the details table rather than in the sentence,
   * because when and who are the two things somebody opens this to check
   * and a label beside each is faster to read than a paragraph containing
   * both. The policy keeps its own block, in their words, under its own
   * heading, exactly as the reminder does.
   */
  const html = buildEmail({
    business: studioName,
    heading: "You are booked in",
    body: `Hello ${firstName}, that is all confirmed. The appointment is attached to this email, so you can add it to your calendar.`,
    details: [
      { label: "When", value: when },
      ...(artistName ? [{ label: "Who", value: artistName }] : []),
      ...(depositPence
        ? [
            {
              label: "Deposit",
              value: `${formatPence(depositPence)} received, and it comes off the total on the day`,
            },
          ]
        : []),
    ],
    policy: cancellationPolicy ?? null,
    replies: true,
    contactEmail: contactEmail ?? null,
    accent: accent ?? null,
  });

  return { subject: `You are booked in: ${when}`, text, html, calendar };
}
