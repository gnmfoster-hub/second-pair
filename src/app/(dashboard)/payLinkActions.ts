"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { createPaymentLink } from "@/lib/payments/link";
import { canMessage } from "@/lib/permissions";
import { routesFor } from "@/lib/messaging/reach";
import { connectedChannels, smsNumberFor } from "@/lib/messaging/connections";
import { deliver } from "@/lib/messaging/deliver";
import { replyToFor } from "@/lib/messaging/replyTo";
import { parsePounds, formatPence } from "@/lib/money";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";

export type PayLinkState = {
  error?: string;
  /** The link itself, so it can be copied even when nothing was sent. */
  url?: string;
  /** Where it went, when it was sent rather than handed over. */
  sentOn?: string;
  /** Said out loud where the money is not going where somebody expects. */
  note?: string;
};

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Ask somebody to pay, from wherever you happen to be.
 *
 * One action behind four screens: an appointment in the diary, a client's
 * record, the conversation you are already having with them, and the till.
 * They are the four places where somebody realises money is owed, and until
 * now exactly one of them could do anything about it — the assistant, at the
 * moment it took a booking, for a deposit only.
 *
 * Everything difficult about this lives somewhere else and is tested there:
 * whose account it lands in is whoTakes, the link itself is lib/payments/link,
 * and how it reaches somebody is the same delivery the rest of the product
 * uses. What is left here is the order things happen in, and that order
 * matters: the row is written first, so a payment that completes always has
 * somewhere to be recorded, even if the sending falls over afterwards.
 */
export async function askForPayment(
  _prev: PayLinkState,
  fd: FormData,
): Promise<PayLinkState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const amountPence = parsePounds(fd.get("amount"));
  if (amountPence == null || amountPence <= 0) {
    return { error: "How much is it for?" };
  }

  const kind = str(fd, "kind") === "deposit" ? "deposit" : "payment";
  const description = str(fd, "description") || `${studio.name}`;
  const contactId = str(fd, "contact_id") || null;
  const bookingId = str(fd, "booking_id") || null;

  /*
   * Whose takings this is.
   *
   * Named by the screen where it is known — an appointment knows whose column
   * it is in — and otherwise whoever is asking. On the per-person model this
   * is the difference between the money landing in Sarah's account and the
   * shop's, so it is never left to chance.
   */
  let artistId = str(fd, "artist_id") || null;
  if (!artistId) {
    const { data: mine } = await supabase
      .from("artists")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("user_id", userId)
      .maybeSingle();
    artistId = mine?.id ?? null;
  }

  const { data: person } = artistId
    ? await supabase
        .from("artists")
        .select("*")
        .eq("id", artistId)
        .eq("studio_id", studio.id)
        .maybeSingle()
    : { data: null };

  if (artistId && !person) return { error: "That person is not in this business." };

  const { data: contact } = contactId
    ? await supabase
        .from("contacts")
        .select("*, conversations(id, channel, external_ref, last_inbound_at)")
        .eq("id", contactId)
        .eq("studio_id", studio.id)
        .maybeSingle()
    : { data: null };

  if (contactId && !contact) return { error: "That client is not in this business." };

  /*
   * The row first, then the link.
   *
   * Deliberately this way round. The link carries the row's id back on the
   * webhook, so a payment that completes always has a home — and a row with no
   * link is a harmless pending line that expires, whereas a link with no row
   * is money arriving with nothing to attach it to and a quarter's takings
   * quietly short.
   */
  const { data: payment, error: rowError } = await supabase
    .from("payments")
    .insert({
      studio_id: studio.id,
      artist_id: artistId,
      contact_id: contactId,
      booking_id: bookingId,
      kind,
      gross_pence: amountPence,
      status: "pending",
      method: "link",
      description,
    })
    .select("id")
    .single();

  if (rowError || !payment) {
    return { error: rowError?.message ?? "Could not start that payment." };
  }

  let link;
  try {
    link = await createPaymentLink({
      business: { ...studio, id: studio.id, name: studio.name },
      person: person ?? null,
      kind,
      amountPence,
      description,
      origin: await siteOrigin(),
      paymentId: payment.id as string,
      bookingId,
      contactId,
      clientEmail: (contact?.email as string | null) ?? null,
    });
  } catch (e) {
    /*
     * The pending row goes with it.
     *
     * Left behind it would sit in the takings as money somebody is waiting
     * for, for a payment that was never asked for — which is worse than the
     * refusal, because the refusal is on screen and the row is not.
     */
    await supabase.from("payments").delete().eq("id", payment.id);
    return { error: e instanceof Error ? e.message : "Stripe would not make that link." };
  }

  await supabase
    .from("payments")
    .update({ stripe_session_id: link.sessionId, destination_account: link.account })
    .eq("id", payment.id);

  const note = link.fellBack
    ? "They have no Stripe account of their own, so this one goes to the business."
    : undefined;

  /*
   * Send it, or hand it over.
   *
   * Somebody stood at the desk with the client in front of them wants the link
   * on screen to show them; somebody chasing a balance wants it sent. Both are
   * the same action with a different last step.
   */
  const sendOn = str(fd, "send_on") as Channel | "";
  if (!sendOn) {
    revalidatePath("/diary");
    return { url: link.url, note };
  }

  const sent = await sendLink({
    supabase,
    studio,
    contact: contact as LinkContact | null,
    sendOn,
    url: link.url,
    amountPence,
    description,
  });
  if (sent.error) return { url: link.url, note, error: sent.error };

  revalidatePath("/diary");
  revalidatePath("/clients");
  if (contactId) revalidatePath(`/clients/${contactId}`);

  return { url: link.url, sentOn: sendOn, note };
}

type LinkContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  prefers?: string | null;
  conversations:
    | { id: string; channel: string; external_ref: string | null; last_inbound_at: string | null }[]
    | null;
};

/**
 * Putting a link that already exists in front of the person who owes it.
 *
 * Shared by asking for a payment from a record or a conversation and by
 * completing an appointment, which makes its link first and asks where to send
 * it second. Two copies of "which way can we reach them, and write it into the
 * thread" would drift, and the one that drifted would be the one that texted a
 * customer from the wrong number.
 */
async function sendLink({
  supabase,
  studio,
  contact,
  sendOn,
  url,
  amountPence,
  description,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  studio: Awaited<ReturnType<typeof requireStudio>>["studio"];
  contact: LinkContact | null;
  sendOn: Channel;
  url: string;
  amountPence: number;
  description: string;
}): Promise<{ error?: string }> {
  if (!(await canMessage())) {
    return { error: "You cannot message customers, so here is the link to copy." };
  }

  if (!contact) return { error: "Nobody to send it to — here is the link." };

  /*
   * The demo pretends, and says so.
   *
   * Its clients are invented and its numbers are the ones Ofcom keeps for
   * drama, so nothing may actually leave — but a demo that stops at "texting
   * is not set up" cannot show the thing it is there to show. So it goes as
   * far as a real send would and no further: the right number, the right
   * words, written into the thread.
   */
  if (studio.kind === "demo") {
    const to = sendOn === "sms" ? contact.phone : sendOn === "email" ? contact.email : null;
    if (!to) return { error: "There is nothing on their record to send that to." };
    return {};
  }

  const routes = routesFor({
    conversations: (contact.conversations ?? []) as never,
    phone: contact.phone,
    email: contact.email,
    /* Which way they asked to be reached, where they have said. */
    prefers: (contact.prefers ?? null) as "sms" | "email" | null,
    connected: await connectedChannels(supabase, studio.id),
  });

  const route = routes.find((r) => r.channel === sendOn);
  if (!route?.open) {
    return {
      error: route?.blocked ?? "There is no way to reach them on that. Here is the link to copy.",
    };
  }

  const firstName = (contact.name ?? "").split(" ")[0];
  const body =
    `${firstName ? `Hi ${firstName}, ` : ""}here is a link to pay ` +
    `${formatPence(amountPence)} for ${description} — ${url}`;

  const sent = await deliver({
    channel: route.channel,
    to: route.to,
    body,
    lastInboundAt: route.lastInboundAt,
    // A text goes out from the business's own number, so the link arrives from
    // the number they already have rather than from a stranger.
    from: route.channel === "sms" ? await smsNumberFor(supabase, studio.id) : undefined,
    subject: `${studio.name} — ${formatPence(amountPence)} to pay`,
    fromName: studio.name,
    replyTo: replyToFor(studio),
  });

  if (sent.status === "failed") {
    return { error: `${sent.error ?? "It would not send"} — here is the link to copy instead.` };
  }

  /*
   * Written into the thread as well as sent.
   *
   * Otherwise the only record that anybody was asked for money is a text
   * message on somebody else's phone, and the next person to open this
   * conversation has no idea it happened.
   */
  const existing = contact.conversations ?? [];
  const thread = existing.find((c) => c.channel === route.channel) ?? existing[0];
  if (thread) {
    await supabase.from("messages").insert({
      conversation_id: thread.id,
      role: "owner",
      content: body,
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", thread.id);
  }

  return {};
}

/**
 * The ways a link could reach this client right now, for buttons to offer.
 *
 * Only the open ones, each with where it would go, so a button can say "Text
 * 07700 900406" rather than "Send" and leave somebody wondering where to.
 */
export async function linkRoutes(
  contactId: string | null,
): Promise<{ channel: Channel; label: string; to: string }[]> {
  if (!contactId) return [];
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, conversations(id, channel, external_ref, last_inbound_at)")
    .eq("id", contactId)
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (!contact) return [];

  // The demo offers what a real business with texting and email would.
  if (studio.kind === "demo") {
    return [
      ...(contact.phone ? [{ channel: "sms" as Channel, label: "Text", to: contact.phone as string }] : []),
      ...(contact.email ? [{ channel: "email" as Channel, label: "Email", to: contact.email as string }] : []),
    ];
  }

  const routes = routesFor({
    conversations: (contact.conversations ?? []) as never,
    phone: contact.phone as string | null,
    email: contact.email as string | null,
    prefers: ((contact as { prefers?: string | null }).prefers ?? null) as "sms" | "email" | null,
    connected: await connectedChannels(supabase, studio.id),
  });

  return routes
    .filter((r) => r.open && r.channel !== "web")
    .map((r) => ({
      channel: r.channel,
      label:
        r.channel === "sms"
          ? "Text"
          : r.channel === "email"
            ? "Email"
            : (CHANNEL_LABELS[r.channel] ?? r.channel),
      to: r.channel === "sms" || r.channel === "email" ? r.to : "",
    }));
}

/**
 * Sending a link made a moment ago by completing an appointment.
 *
 * The payment is read back from this business rather than trusted from the
 * form, and the address has to be a Stripe checkout page — so the worst a
 * doctored form can do is send a client a real link for a real payment.
 */
export async function sendLinkNow(_prev: PayLinkState, fd: FormData): Promise<PayLinkState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const url = str(fd, "url");
  const sendOn = str(fd, "send_on") as Channel;
  if (!url.startsWith("https://checkout.stripe.com/")) return { error: "That is not a payment link." };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, contact_id, gross_pence, description, status")
    .eq("id", str(fd, "payment_id"))
    .eq("studio_id", studio.id)
    .maybeSingle();
  if (!payment) return { url, error: "That payment is not in this business." };
  if (payment.status === "paid") return { url, error: "That has already been paid." };

  const { data: contact } = payment.contact_id
    ? await supabase
        .from("contacts")
        .select("*, conversations(id, channel, external_ref, last_inbound_at)")
        .eq("id", payment.contact_id)
        .eq("studio_id", studio.id)
        .maybeSingle()
    : { data: null };

  const sent = await sendLink({
    supabase,
    studio,
    contact: contact as LinkContact | null,
    sendOn,
    url,
    amountPence: payment.gross_pence as number,
    description: (payment.description as string | null) ?? studio.name,
  });
  if (sent.error) return { url, error: sent.error };

  revalidatePath("/diary");
  if (payment.contact_id) revalidatePath(`/clients/${payment.contact_id}`);
  return { url, sentOn: sendOn, note: studio.kind === "demo" ? "Demo: nothing was really sent." : undefined };
}
