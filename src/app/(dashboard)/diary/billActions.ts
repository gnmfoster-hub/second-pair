"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { createPaymentLink } from "@/lib/payments/link";
import { readSale, readMethod, linesFromForm, penceOf, type SaleLine } from "@/lib/sales";
import { hasColumn } from "@/lib/db/hasColumn";
import { sendPaymentReceipt } from "@/lib/messaging/receipt";

export type BillState = {
  error?: string;
  ok?: boolean;
  total?: number;
  /** A link to show them, where that is how it is being taken. */
  url?: string;
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

  /*
   * The work is optional on purpose.
   *
   * Somebody who paid their balance last week, or whose colour is on an
   * account, is still buying a bottle on the way out — and a bill that
   * insisted on charging for the appointment again would be the wrong answer
   * given confidently.
   */
  const charging = Number.isFinite(workPence) && workPence > 0;

  const products = readSale(linesFromForm((k) => fd.get(k) as string | null));
  if (!products.ok) return { error: products.because };

  const lines: SaleLine[] = [
    ...(charging
      ? [{ serviceId: null, name: workName, quantity: 1, unitPence: workPence }]
      : []),
    ...products.lines,
  ];

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPence, 0);
  if (total <= 0) return { error: "There is nothing on this bill yet." };

  /*
   * Whose takings it is: the chair the appointment sits in, not whoever
   * happens to be at the desk closing it off. On the per-person model that is
   * the difference between the money being Sarah's and being the shop's.
   */
  const artistId = (booking.artist_id as string | null) ?? null;
  const contactId = (booking.contact_id as string | null) ?? null;

  const description = lines
    .map((l) => (l.quantity > 1 ? `${l.quantity} × ${l.name}` : l.name))
    .join(", ");

  // The diary and the till agree about what this appointment cost.
  if (charging && workPence !== booking.price_pence) {
    await supabase.from("bookings").update({ price_pence: workPence }).eq("id", bookingId);
  }

  const method = str(fd, "method");
  const asLink = method === "link";

  const { data: payment, error } = await supabase
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
    const { error: lineError } = await supabase.from("payment_items").insert(
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

      await supabase
        .from("payments")
        .update({ stripe_session_id: link.sessionId, destination_account: link.account })
        .eq("id", payment.id);

      revalidatePath("/diary");
      return { ok: true, total, url: link.url };
    } catch (e) {
      /*
       * Taken back out again, and the reason said.
       *
       * A pending payment with no link is a row that will sit in the takings
       * for ever saying somebody owes money they were never asked for. The
       * bill is still on screen, so nothing anybody typed is lost.
       */
      await supabase.from("payments").delete().eq("id", payment.id);
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
