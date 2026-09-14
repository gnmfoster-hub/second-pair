import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, with extensions, so the composing half below can be loaded and
// tested by node directly. The rest of the codebase uses the @/ alias.
import { sendEmail, emailConfigured } from "./email.ts";
import { replyToFor } from "./replyTo.ts";
import { formatExactPence } from "../money.ts";

/**
 * The receipt a customer gets when they pay.
 *
 * Everything the product can now ask somebody to pay for — a balance on the
 * day, a course paid up front, two bottles being collected on Friday, a
 * deposit on an appointment added by hand — sent them a link, took their
 * money, and said nothing afterwards. No email, no document, nothing to keep.
 * The only paid-for thing that ever produced one was a deposit the assistant
 * took while booking, and that was a sentence inside an email about an
 * appointment rather than a receipt.
 *
 * Which is the half of a payment a customer notices is missing. Money left
 * their account and the business went quiet, and the only way to check it had
 * worked was to ask.
 *
 * Deliberately not sent for a deposit taken during booking: that already
 * sends a confirmation within the same second, and two emails a second apart
 * read as a glitch rather than as thoroughness. The confirmation says what was
 * paid. This is for the payments that said nothing at all.
 *
 * Nothing in here is allowed to throw, for the same reason as the confirmation
 * beside it: it is called from the Stripe webhook, and an email that will not
 * send must never be the reason Stripe retries a payment that has gone
 * through.
 */
export async function sendPaymentReceipt(
  db: SupabaseClient,
  paymentId: string,
): Promise<void> {
  try {
    if (!emailConfigured()) return;

    /*
     * The whole row. Naming columns would break this between a deploy and its
     * migration, and a receipt is exactly the sort of thing that would then
     * fail quietly for a fortnight before anybody noticed.
     */
    const { data: payment } = await db
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (!payment || payment.status !== "paid") return;

    const [{ data: items }, { data: studio }, { data: contact }] = await Promise.all([
      db
        .from("payment_items")
        .select("name, quantity, unit_pence")
        .eq("payment_id", paymentId)
        .order("sort_order"),
      db.from("studios").select("*").eq("id", payment.studio_id).maybeSingle(),
      payment.contact_id
        ? db.from("contacts").select("name, email").eq("id", payment.contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    /*
     * No address, nothing to send to, and not a failure.
     *
     * A walk-in who paid at the till over a card machine has no email and was
     * never asked for one. The money is recorded either way, which is the part
     * that has to be right.
     */
    if (!studio || !contact?.email) return;

    const { subject, text } = composeReceipt({
      businessName: studio.name,
      amountPence: payment.gross_pence,
      paidAt: payment.paid_at ?? payment.created_at,
      timezone: studio.timezone ?? "Europe/London",
      kind: payment.kind,
      description: payment.description,
      contactName: contact.name,
      reference: paymentId,
      items: (items ?? []).map((i) => ({
        name: i.name as string,
        quantity: i.quantity as number,
        unitPence: i.unit_pence as number,
      })),
      vat: studio.vat_registered
        ? { ratePercent: studio.vat_rate_percent ?? 20, number: studio.vat_number ?? null }
        : null,
    });

    const result = await sendEmail({
      to: contact.email,
      subject,
      text,
      fromName: studio.name,
      replyTo: replyToFor(studio),
    });

    if (result.status !== "sent") {
      console.error("[receipt] not sent", paymentId, result.error);
    }
  } catch {
    // Swallowed on purpose. See the note at the top.
  }
}

export type ReceiptLine = { name: string; quantity: number; unitPence: number };

/**
 * The words, with nothing that touches the network.
 *
 * Separated so it can be tested, and because a customer checks the arithmetic
 * on it with a calculator. Every figure is the one they were actually charged:
 * the lines were copied from what they were told at the time rather than
 * looked up now, so a product repriced in October cannot rewrite a receipt
 * from March.
 */
export function composeReceipt({
  businessName,
  amountPence,
  paidAt,
  timezone,
  kind,
  description,
  contactName,
  reference,
  items,
  vat,
}: {
  businessName: string;
  amountPence: number;
  paidAt: string;
  timezone: string;
  /** deposit, payment or product. A deposit is worded differently. */
  kind: string | null;
  /** What it was for, in the business's words, when there are no lines. */
  description: string | null;
  contactName: string | null;
  /** The payment's own id. Shortened, because nobody reads out a uuid. */
  reference: string;
  items: ReceiptLine[];
  /** Only for a registered business. Saying anything otherwise is misleading. */
  vat: { ratePercent: number; number: string | null } | null;
}): { subject: string; text: string } {
  const firstName = contactName?.split(" ")[0] ?? "there";
  const paid = formatExactPence(amountPence);
  const deposit = kind === "deposit";

  const when = new Date(paidAt).toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  /*
   * The lines, laid out so the figures line up for somebody reading in a
   * monospaced font and still read as a list for somebody who is not.
   *
   * Width from the longest name rather than a fixed number: a salon selling
   * "Olaplex No.4 Bond Maintenance Shampoo 250ml" would otherwise have every
   * amount shoved off into a ragged column of its own.
   */
  const rows = items.map((i) => ({
    left: i.quantity > 1 ? `${i.quantity} x ${i.name}` : i.name,
    right: formatExactPence(i.quantity * i.unitPence),
  }));

  const width = Math.max(0, ...rows.map((r) => r.left.length));
  const lines = rows.map((r) => `  ${r.left.padEnd(width)}   ${r.right}`).join("\n");

  const what = rows.length
    ? `\n\n${lines}\n\n  ${"Paid".padEnd(width)}   ${paid}`
    : `\n\n  ${description ?? (deposit ? "Deposit" : "Payment")}: ${paid}`;

  /*
   * The VAT inside what they paid, not on top of it.
   *
   * The gross is what left their account, so the VAT within it is
   * gross - gross / (1 + rate). Doing it the other way round overstates the
   * VAT, on a document somebody may well hand to an accountant.
   */
  const vatLine =
    vat && amountPence > 0
      ? `\n\nIncludes VAT at ${vat.ratePercent}% (${formatExactPence(
          amountPence - Math.round(amountPence / (1 + vat.ratePercent / 100)),
        )}).${vat.number ? ` VAT number ${vat.number}.` : ""}`
      : "";

  const text =
    `Hello ${firstName},\n\n` +
    (deposit
      ? "Thank you — your deposit has been received. It comes off the total on the day."
      : "Thank you — your payment has gone through.") +
    what +
    `\n\nPaid on ${when}.\nReference ${shortRef(reference)}.` +
    vatLine +
    `\n\nThis is your receipt; it is worth keeping. If anything on it looks wrong, ` +
    `reply to this email and it comes straight to us.\n\n${businessName}`;

  return {
    subject: `${deposit ? "Deposit received" : "Receipt"} — ${paid} — ${businessName}`,
    text,
  };
}

/**
 * Something a person can read down the phone.
 *
 * A uuid is 36 characters and nobody has ever read one out correctly. The
 * first block is unique enough to find the row among one business's payments,
 * and it is what somebody would quote when they ring up about it.
 */
export function shortRef(id: string): string {
  return id.split("-")[0].toUpperCase();
}
