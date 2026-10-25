import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, with extensions, so the composing half below can be loaded and
// tested by node directly. The rest of the codebase uses the @/ alias.
import { formatPence } from "../money.ts";

/**
 * Telling the business a customer moved or cancelled their own appointment.
 *
 * alertNewBooking has existed since the assistant could book. Nothing existed
 * for a change, because until now the assistant could not make one: a
 * customer asking got an escalation, and an escalation at least announces
 * itself. Handing it the tool without this would be worse than the problem it
 * fixes, because a diary that quietly empties itself is the one thing a
 * business will never forgive.
 *
 * Giles, 22 October, on Jess: her appointment was taken out of the diary by
 * hand and nobody told her. This is the same fault pointing the other way,
 * and it is the one that loses the client rather than the customer.
 *
 * Never allowed to fail loudly. The change is already in the diary and the
 * customer has already been answered by the time this runs.
 */

export type ChangeAlert = {
  /** Lock-screen title. Short, and safe to be read over their shoulder. */
  title: string;
  /** Lock-screen body. */
  body: string;
  emailSubject: string;
  emailText: string;
};

/** The words, with nothing that touches the network. */
export function composeChangeAlert({
  what,
  was,
  now,
  contactName,
  contactPhone,
  contactEmail,
  artistName,
  studioName,
  timezone,
  depositPence,
  depositPaid,
  conversationUrl,
}: {
  what: "cancelled" | "moved";
  /** The time it was at. */
  was: string;
  /** The time it is at now. Moves only. */
  now?: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  artistName: string | null;
  studioName: string;
  timezone: string;
  depositPence: number;
  depositPaid: boolean;
  conversationUrl: string;
}): ChangeAlert {
  const long = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  /* The title is cut somewhere around forty characters on a phone, and the
     half that goes is the end, which is where the time lives. */
  const short = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
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

  /*
   * A first name only on the lock screen, as the booking alert does it. This
   * is read by whoever is stood next to them, and their diary is their own
   * business.
   */
  const body =
    what === "cancelled"
      ? `${firstName} cancelled ${short(was)}.`
      : `${firstName} moved to ${now ? short(now) : "another time"}.`;

  const reach = [
    contactPhone ? `Phone: ${contactPhone}` : null,
    contactEmail ? `Email: ${contactEmail}` : null,
  ].filter(Boolean);

  /*
   * A deposit already paid on an appointment that is now off.
   *
   * Said plainly and left with them. Nothing in this product has ever
   * promised a customer their money back and nothing here starts: the note to
   * the customer says the same, so the two cannot contradict each other.
   */
  const money =
    depositPence && depositPaid
      ? what === "cancelled"
        ? `A deposit of ${formatPence(depositPence)} has been paid. Nothing has been said to them about a refund, so that is yours to decide.`
        : `The deposit of ${formatPence(depositPence)} stays on the appointment.`
      : null;

  const emailText = [
    what === "cancelled"
      ? `${who} has cancelled their appointment.`
      : `${who} has moved their appointment.`,
    "",
    `It was:  ${long(was)}`,
    ...(what === "moved"
      ? [`It is now:  ${now ? long(now) : "a time that did not record"}`]
      : []),
    ...(artistName ? [`Who with:  ${artistName}`] : []),
    ...(reach.length ? ["", ...reach] : []),
    ...(money ? ["", money] : []),
    "",
    "The whole conversation, and what they said:",
    conversationUrl,
    "",
    /*
     * The same promise the booking alert makes, because the reflex it heads
     * off is the same one: ringing a customer to confirm something they have
     * already been told, which undoes the point of the thing.
     */
    what === "cancelled"
      ? `${firstName} has been told it is cancelled, so there is nothing you need to do.`
      : `${firstName} has been told the new time, so there is nothing you need to do.`,
    "",
    /* A sign-off, not a dash joining a sentence. */
    `From Second Pair, for ${studioName}`,
  ].join("\n");

  return {
    title:
      what === "cancelled"
        ? `Cancelled: ${short(was)}`
        : `Moved to ${now ? short(now) : "another time"}`,
    body,
    emailSubject:
      what === "cancelled"
        ? `Cancelled by ${who}: ${short(was)}`
        : `Moved by ${who}: now ${now ? short(now) : "another time"}`,
    emailText,
  };
}

/**
 * Everything the alert needs, gathered from a booking id.
 *
 * Small queries rather than one deep join, for the same reason the booking
 * alert does it: PostgREST will do the join and the types give up several
 * levels down.
 *
 * Unlike gatherBookingAlert this does NOT refuse a cancelled row, because a
 * cancelled row is the whole point of half the calls.
 */
export async function gatherChangeAlert(
  db: SupabaseClient,
  bookingId: string,
  siteUrl: string,
  what: "cancelled" | "moved",
  was: string,
): Promise<
  (ChangeAlert & { studioId: string; conversationId: string; artistId: string | null }) | null
> {
  const { data: booking } = await db
    .from("bookings")
    .select(
      "id, starts_at, deposit_amount_pence, deposit_status, enquiry_id, artist_id, artists(name)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return null;

  const { data: enquiry } = await db
    .from("enquiries")
    .select("conversation_id")
    .eq("id", booking.enquiry_id)
    .maybeSingle();

  if (!enquiry?.conversation_id) return null;

  const { data: conversation } = await db
    .from("conversations")
    .select("id, studio_id, is_test, contacts(name, phone, email), studios(name, timezone)")
    .eq("id", enquiry.conversation_id)
    .maybeSingle();

  // PostgREST returns an object for a to-one join, not an array.
  const contact = conversation?.contacts as unknown as {
    name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  const studio = conversation?.studios as unknown as {
    name: string;
    timezone: string | null;
  } | null;

  if (!studio || !conversation?.studio_id) return null;

  // Somebody trying it out, usually us. Nobody's phone should buzz for it.
  if (conversation.is_test) return null;

  const alert = composeChangeAlert({
    what,
    was,
    now: what === "moved" ? booking.starts_at : null,
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone ?? null,
    contactEmail: contact?.email ?? null,
    artistName: (booking.artists as unknown as { name: string } | null)?.name ?? null,
    studioName: studio.name,
    timezone: studio.timezone ?? "Europe/London",
    depositPence: booking.deposit_amount_pence ?? 0,
    depositPaid: booking.deposit_status === "paid",
    conversationUrl: `${siteUrl}/conversations/${enquiry.conversation_id}`,
  });

  return {
    ...alert,
    studioId: conversation.studio_id,
    conversationId: enquiry.conversation_id,
    artistId: booking.artist_id ?? null,
  };
}
