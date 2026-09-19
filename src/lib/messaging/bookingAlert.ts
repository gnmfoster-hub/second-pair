import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, with extensions, so the composing half below can be loaded and
// tested by node directly. The rest of the codebase uses the @/ alias.
import { formatPence } from "../money.ts";

/**
 * Telling the business somebody just booked.
 *
 * The assistant puts a stranger into their diary while they are up a ladder or
 * mid-session, and until now the only way to find out was to open the
 * dashboard and look. That is fine for a business expecting one booking a
 * week and useless for anybody else: the thing they are actually buying is
 * being able to stop watching, and they cannot stop watching a diary they have
 * to check.
 *
 * Two ways at once, because they land in different places. The phone buzzes
 * for the ones holding a phone, and the email is there for everybody else and
 * still there tomorrow. Neither is allowed to fail loudly — a booking is
 * already made and saved by the time this runs, and an alert that throws must
 * never be the reason the customer's reply does not arrive.
 */

export type BookingAlert = {
  /** Lock-screen title. Short, and safe to be read over their shoulder. */
  title: string;
  /** Lock-screen body. */
  body: string;
  emailSubject: string;
  emailText: string;
};

/**
 * The words, with nothing that touches the network.
 *
 * Separated so it can be tested, and so the two wordings sit next to each
 * other where the difference between them is visible.
 */
export function composeBookingAlert({
  startsAt,
  minutes,
  type,
  contactName,
  contactPhone,
  contactEmail,
  artistName,
  studioName,
  timezone,
  depositPence,
  depositPaid,
  depositOptional = false,
  conversationUrl,
}: {
  startsAt: string;
  minutes: number;
  type: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  artistName: string | null;
  studioName: string;
  timezone: string;
  depositPence: number;
  depositPaid: boolean;
  /**
   * Whether the deposit secures the slot or merely offers to.
   *
   * Defaults to the stricter reading, which is what every caller meant before
   * this existed — and is the safe way round to be wrong, because a business
   * that thinks an unpaid slot is firm keeps it rather than giving it away.
   */
  depositOptional?: boolean;
  conversationUrl: string;
}): BookingAlert {
  const starts = new Date(startsAt);

  const when = starts.toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    // "3:00 pm", not "15:00" — read one-handed, half-glanced at.
    hour12: true,
  });

  /*
   * The short one drops the year and the weekday's tail. A notification title
   * is truncated somewhere around forty characters on a phone, and the half
   * that gets cut is the half at the end, which is where the time lives.
   */
  const shortWhen = starts.toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const who = contactName?.trim() || "Someone";
  const firstName = who.split(" ")[0];
  const job = type === "consultation" ? "consultation" : "appointment";

  /*
   * A first name only on the lock screen.
   *
   * This is read by whoever is stood next to them — the client in the chair,
   * somebody on the bus. Their diary is their business, and a full name and a
   * mobile number on a lock screen is neither necessary nor theirs to spill.
   * The email is private to them, so it carries everything.
   */
  const body = `${firstName}, ${minutes} minutes${artistName ? ` with ${artistName}` : ""}.`;

  const reach = [
    contactPhone ? `Phone: ${contactPhone}` : null,
    contactEmail ? `Email: ${contactEmail}` : null,
  ].filter(Boolean);

  /*
   * What is actually true about an unpaid deposit here.
   *
   * This said "the slot is held until it is paid" for every business, and for
   * a salon where the deposit is optional that is not what the customer was
   * told and not what the business decided: their booking stands whether they
   * pay or not. An owner reading it the other way gives the chair away.
   */
  const deposit = depositPence
    ? depositPaid
      ? `Deposit of ${formatPence(depositPence)} paid.`
      : depositOptional
        ? `Deposit of ${formatPence(depositPence)} offered, not paid — the booking stands either way.`
        : `Deposit of ${formatPence(depositPence)} due — the slot is held until it is paid.`
    : null;

  const emailText = [
    `${who} has booked ${type === "consultation" ? "a consultation" : "an appointment"}.`,
    "",
    `When:  ${when}`,
    `How long:  ${minutes} minutes`,
    ...(artistName ? [`Who with:  ${artistName}`] : []),
    ...(reach.length ? ["", ...reach] : []),
    ...(deposit ? ["", deposit] : []),
    "",
    "The whole conversation, and their details:",
    conversationUrl,
    "",
    /*
     * Said out loud, because the alternative is a business ringing a customer
     * to confirm a booking that was already confirmed — which undoes the
     * entire point of the thing and makes them look disorganised.
     */
    `${firstName} has already been told it is booked, so there is nothing you need to do.`,
    "",
    `— Second Pair, for ${studioName}`,
  ].join("\n");

  return {
    title: `New booking — ${shortWhen}`,
    body,
    emailSubject: `New ${job}: ${who}, ${shortWhen}`,
    emailText,
  };
}

/**
 * Everything the alert needs, gathered from a booking id.
 *
 * Small queries rather than one deep join, for the same reason the
 * confirmation does it: PostgREST will do the join but the types give up
 * several levels down and the result comes back as an error shape. Neither of
 * these is a hot path.
 *
 * Returns null when there is nothing worth sending, which is not a failure.
 */
export async function gatherBookingAlert(
  db: SupabaseClient,
  bookingId: string,
  siteUrl: string,
): Promise<
  | (BookingAlert & { studioId: string; conversationId: string; artistId: string | null })
  | null
> {
  const { data: booking } = await db
    .from("bookings")
    /*
     * Whose booking it is comes off the conversation, not off the booking.
     *
     * There is no studio_id on bookings — they hang off an enquiry, which
     * hangs off a conversation, which is the thing that belongs to a business.
     * Asking for one anyway does not return a null column: PostgREST rejects
     * the whole select, the booking comes back as nothing, and the alert
     * quietly decides there is nothing to send. Which is how this was written
     * the first time, and it would have sent absolutely nothing forever
     * without ever logging a word.
     */
    .select(
      "id, starts_at, ends_at, type, deposit_amount_pence, deposit_status, enquiry_id, cancelled_at, artist_id, artists(name)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.cancelled_at) return null;

  const { data: enquiry } = await db
    .from("enquiries")
    .select("conversation_id")
    .eq("id", booking.enquiry_id)
    .maybeSingle();

  if (!enquiry?.conversation_id) return null;

  const { data: conversation } = await db
    .from("conversations")
    .select(
      "id, studio_id, is_test, contacts(name, phone, email), studios(name, timezone, deposit_mode)",
    )
    .eq("id", enquiry.conversation_id)
    .maybeSingle();

  // PostgREST returns an object for a to-one join, not an array. Reading these
  // as arrays is how the figures on the inbox once came out as zero.
  const contact = conversation?.contacts as unknown as {
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  const studio = conversation?.studios as unknown as {
    name: string;
    timezone: string | null;
    deposit_mode: string | null;
  } | null;

  if (!studio || !conversation?.studio_id) return null;

  // A test conversation is somebody trying the thing out, usually us. Nobody's
  // phone should buzz for it.
  if (conversation.is_test) return null;

  const minutes = Math.round(
    (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000,
  );

  const alert = composeBookingAlert({
    startsAt: booking.starts_at,
    minutes,
    type: booking.type,
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone ?? null,
    contactEmail: contact?.email ?? null,
    artistName: (booking.artists as unknown as { name: string } | null)?.name ?? null,
    studioName: studio.name,
    timezone: studio.timezone ?? "Europe/London",
    depositPence: booking.deposit_amount_pence ?? 0,
    depositPaid: booking.deposit_status === "paid",
    depositOptional: studio.deposit_mode === "optional",
    conversationUrl: `${siteUrl}/conversations/${enquiry.conversation_id}`,
  });

  return {
    ...alert,
    studioId: conversation.studio_id as string,
    conversationId: enquiry.conversation_id,
    // Whose diary it goes in, so the person can be told as well as the shop.
    artistId: (booking.artist_id as string | null) ?? null,
  };
}
