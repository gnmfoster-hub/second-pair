"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { createPaymentLink } from "@/lib/payments/link";
import { buildBill, readMethod, linesFromForm, penceOf } from "@/lib/sales";
import { hasColumn } from "@/lib/db/hasColumn";
import { sendPaymentReceipt } from "@/lib/messaging/receipt";
import { linkRoutes } from "../payLinkActions";
import type { Channel } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type BillState = {
  error?: string;
  ok?: boolean;
  total?: number;
  /** Set by completing: how it ended, for the screen that says so. */
  completed?: "done" | "no-show";
  /** A link to show them, where that is how it is being taken. */
  url?: string;
  /** The pending payment behind that link, so it can be sent on afterwards. */
  paymentId?: string;
  /** The ways the link could reach them right now: "Text 07700 900406". */
  sendTo?: { channel: Channel; label: string; to: string }[];
};

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * The bill for an appointment: the work, what it actually came to, and
 * anything they bought on the way out — taken once.
 *
 * This is how a salon finishes with somebody, and it was three separate
 * controls on one panel. The work was quoted at booking and is often not what
 * it turned out to be; the bottle picked up at the desk was a second
 * transaction; taking the money was a third. So the commonest close-out in the
 * trade — "that's the colour, plus the shampoo, ninety-four pounds" — meant
 * amending one thing, recording another, and charging a number worked out in
 * somebody's head.
 *
 * One bill, one payment, one row with lines on it. Which is also what makes
 * the receipt right: somebody who paid ninety-four pounds gets a document
 * saying what the ninety-four was, rather than two that add up to it.
 *
 * The work's price is written back onto the booking when it changes. A colour
 * that ran an hour over and cost twenty pounds more is a fact about that
 * appointment, and leaving the diary saying £95 while the till says £115 puts
 * two different answers on one afternoon.
 */
export async function takePayment(_prev: BillState, fd: FormData): Promise<BillState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  /*
   * Payments are written with the server's own access, once the checks above
   * have said the person and the appointment belong to this business. As the
   * signed-in person, a stylist could only record takings in their own name and
   * could not save the Stripe link on the row, so the desk or a colleague taking
   * payment for somebody else was refused by the database.
   */
  const money = createAdminClient();

  const bookingId = str(fd, "booking_id");
  if (!bookingId) return { error: "No appointment." };

  /*
   * Checked against this business rather than trusted from the form. The id
   * arrives in a hidden field; RLS would refuse somebody else's booking
   * anyway, and this turns that into a sentence instead of a silent no-op.
   */
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, artist_id, contact_id, title, price_pence, artists!inner(studio_id)")
    .eq("id", bookingId)
    .eq("artists.studio_id", studio.id)
    .maybeSingle();

  if (!booking) return { error: "That appointment is not in this diary." };

  const workPence = penceOf(str(fd, "work"));
  const workName = str(fd, "work_name") || (booking.title as string) || "Appointment";
  const charging = Number.isFinite(workPence) && workPence > 0;

  /*
   * Built in lib/sales, where it is tested.
   *
   * This read the bottles with readSale, which refuses a sale with nothing in
   * it — right at the till and exactly wrong here. Somebody has a colour, buys
   * nothing else, pays: "Nothing has been added to this sale yet", every time,
   * on the one path the close-out exists for.
   */
  const bill = buildBill({
    work: charging ? { name: workName, pence: workPence } : null,
    products: linesFromForm((k) => fd.get(k) as string | null),
  });
  if (!bill.ok) return { error: bill.because };

  const lines = bill.lines;
  const total = bill.totalPence;
  const products = { lines: lines.filter((l) => l.serviceId != null) };

  /*
   * Whose takings it is: the chair the appointment sits in, not whoever
   * happens to be at the desk closing it off. On the per-person model that is
   * the difference between the money being Sarah's and being the shop's.
   */
  const artistId = (booking.artist_id as string | null) ?? null;
  const contactId = (booking.contact_id as string | null) ?? null;

  const description = bill.description;

  // The diary and the till agree about what this appointment cost.
  if (charging && workPence !== booking.price_pence) {
    await supabase.from("bookings").update({ price_pence: workPence }).eq("id", bookingId);
  }

  const method = str(fd, "method");
  const asLink = method === "link";

  const { data: payment, error } = await money
    .from("payments")
    .insert({
      studio_id: studio.id,
      artist_id: artistId,
      contact_id: contactId,
      booking_id: bookingId,
      kind: "payment",
      gross_pence: total,
      /*
       * No fee, and so no net, on money taken outside Stripe. Writing a zero
       * would claim we know what a card machine costs, which is between the
       * business and whoever sold them the machine.
       */
      net_pence: null,
      method: asLink ? "link" : readMethod(method),
      status: asLink ? "pending" : "paid",
      description,
      paid_at: asLink ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  /*
   * The lines, written whichever way it is being paid.
   *
   * A link paid tomorrow still has to produce a receipt that says what it was
   * for, and the breakdown is not recoverable from the total. Skipped only
   * where the table is not there yet — the description carries the sale in
   * words, so an older database records it completely rather than breaking.
   */
  if (await hasColumn(supabase, "payment_items", "unit_pence")) {
    const { error: lineError } = await money.from("payment_items").insert(
      lines.map((l, i) => ({
        payment_id: payment.id,
        service_id: l.serviceId,
        name: l.name,
        quantity: l.quantity,
        unit_pence: l.unitPence,
        sort_order: i,
      })),
    );

    if (lineError) {
      return {
        ok: true,
        total,
        error: `Taken, but the breakdown did not save: ${lineError.message}`,
      };
    }
  }

  if (asLink) {
    try {
      const { data: person } = artistId
        ? await supabase.from("artists").select("*").eq("id", artistId).maybeSingle()
        : { data: null };

      const { data: contact } = contactId
        ? await supabase.from("contacts").select("email").eq("id", contactId).maybeSingle()
        : { data: null };

      const link = await createPaymentLink({
        business: { ...studio, id: studio.id, name: studio.name },
        person: person ?? null,
        kind: "payment",
        amountPence: total,
        description,
        origin: await siteOrigin(),
        paymentId: payment.id as string,
        bookingId,
        contactId,
        clientEmail: (contact?.email as string | null) ?? null,
      });

      await money
        .from("payments")
        .update({ stripe_session_id: link.sessionId, destination_account: link.account })
        .eq("id", payment.id);

      revalidatePath("/diary");
      return {
        ok: true,
        total,
        url: link.url,
        paymentId: payment.id as string,
        sendTo: await linkRoutes(contactId).catch(() => []),
      };
    } catch (e) {
      /*
       * Taken back out again, and the reason said.
       *
       * A pending payment with no link is a row that will sit in the takings
       * for ever saying somebody owes money they were never asked for. The
       * bill is still on screen, so nothing anybody typed is lost.
       */
      await money.from("payments").delete().eq("id", payment.id);
      return { error: e instanceof Error ? e.message : "Stripe would not make a link." };
    }
  }

  /*
   * And the shelf goes down by what left it. Only things the shop counts, one
   * at a time, never below nought — a shop that finds minus one on a shelf has
   * learned the number cannot be trusted, and from then on it is furniture.
   */
  if (await hasColumn(supabase, "services", "stock")) {
    for (const line of products.lines) {
      if (!line.serviceId) continue;

      const { data: item } = await supabase
        .from("services")
        .select("stock")
        .eq("id", line.serviceId)
        .eq("studio_id", studio.id)
        .maybeSingle();

      const left = item?.stock as number | null | undefined;
      if (left == null) continue;

      await supabase
        .from("services")
        .update({ stock: Math.max(0, left - line.quantity) })
        .eq("id", line.serviceId)
        .eq("studio_id", studio.id);
    }
  }

  // Silent where they have no address, which is most walk-ins.
  if (contactId) await sendPaymentReceipt(supabase, payment.id as string);

  revalidatePath("/diary");
  revalidatePath("/clients");
  if (contactId) revalidatePath(`/clients/${contactId}`);

  return { ok: true, total };
}

/**
 * Completing an appointment: that it happened, what it came to, and the money
 * — in one tap.
 *
 * Asked for repeatedly as "a complete button", and argued with, wrongly. The
 * argument was that finishing is several facts — did they come, what did it
 * cost, how was it paid — and one button would have to guess at them. True, and
 * beside the point: nobody wanted one button that guessed. They wanted one
 * place that asks, in order, and one tap at the end that does all of it,
 * instead of three separate controls on a sheet that each saved something on
 * their own and left the appointment half finished whenever somebody stopped
 * after the second.
 *
 * So this is the whole close-out. A no-show is one fact and finishes there.
 * Otherwise: marked as having come, the service and the price written back
 * onto the appointment if they changed, how long it really took if somebody
 * said, and then — unless it was already paid for — the bill, through exactly
 * the same path as taking payment, so there is one way money is recorded and
 * not two.
 */
export async function completeAppointment(
  _prev: BillState,
  fd: FormData,
): Promise<BillState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const bookingId = str(fd, "booking_id");
  if (!bookingId) return { error: "No appointment." };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, title, contact_id, artists!inner(studio_id)")
    .eq("id", bookingId)
    .eq("artists.studio_id", studio.id)
    .maybeSingle();

  if (!booking) return { error: "That appointment is not in this diary." };

  const came = str(fd, "attended") !== "no";

  if (!came) {
    await supabase
      .from("bookings")
      .update({ attended: false, updated_at: new Date().toISOString() })
      .eq("id", bookingId);

    revalidatePath("/diary");
    revalidatePath("/report");
    return { ok: true, completed: "no-show", total: 0 };
  }

  /*
   * What actually happened, written onto the appointment first.
   *
   * Before any money, so that an appointment which came and was not charged —
   * a regular on an account, a freebie, a redo — is still closed off rather
   * than left looking like nobody had dealt with it.
   */
  const patch: Record<string, unknown> = {
    attended: true,
    updated_at: new Date().toISOString(),
  };

  const minutes = Number(str(fd, "actual_minutes"));
  if (Number.isFinite(minutes) && minutes > 0) patch.actual_minutes = Math.round(minutes);

  // They had something other than what was booked — a cut that became a colour.
  const workName = str(fd, "work_name");
  if (workName && workName !== booking.title) patch.title = workName;

  await supabase.from("bookings").update(patch).eq("id", bookingId);

  const method = str(fd, "method");

  // Came, and nothing to take today: already paid, on account, or no charge.
  if (!method || method === "none") {
    revalidatePath("/diary");
    revalidatePath("/report");
    const contactId = booking.contact_id as string | null;
    if (contactId) revalidatePath(`/clients/${contactId}`);
    return { ok: true, completed: "done", total: 0 };
  }

  // And the money, down the one path money is recorded by.
  const paid = await takePayment(_prev, fd);
  return paid.error && !paid.ok ? paid : { ...paid, completed: "done" };
}
