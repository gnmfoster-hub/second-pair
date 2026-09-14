"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { resolveContact } from "@/lib/clients/resolve";
import { readSale, readMethod, type SaleLine } from "@/lib/sales";
import { hasColumn } from "@/lib/db/hasColumn";
import { sendPaymentReceipt } from "@/lib/messaging/receipt";

export type SellState = { error?: string; ok?: boolean; total?: number };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * A price typed in pounds, kept in pence.
 *
 * Everything downstream is integer pence, and the conversion happens once,
 * here, at the edge where a person typed something.
 */
function penceOf(raw: string): number {
  const clean = raw.replace(/[£,\s]/g, "");
  if (!clean) return Number.NaN;
  const pounds = Number(clean);
  if (!Number.isFinite(pounds)) return Number.NaN;
  return Math.round(pounds * 100);
}

/**
 * The lines of the sale, as the form describes them.
 *
 * Indexed field names rather than a JSON blob, for the same reason the group
 * form uses them: it works without JavaScript, and a half-filled row shows up
 * in the request rather than inside a string somebody has to unpick.
 */
function readLines(fd: FormData): Partial<SaleLine>[] {
  const lines: Partial<SaleLine>[] = [];
  for (let i = 0; i < 30; i++) {
    const name = str(fd, `name_${i}`);
    const price = str(fd, `price_${i}`);
    if (!name && !price) continue;

    lines.push({
      serviceId: str(fd, `service_${i}`) || null,
      name,
      quantity: Number(str(fd, `qty_${i}`) || "1"),
      unitPence: penceOf(price),
    });
  }
  return lines;
}

/**
 * Something sold over the counter.
 *
 * Not an appointment and not a Stripe charge. A shop sells a bottle of
 * shampoo, takes a tenner for it, and needs that to appear in the day's
 * takings and on the client's record — and at the end of a quarter, in the
 * file the accountant gets.
 *
 * Recording, not processing. Cash and a card machine both happen entirely
 * outside this product, and writing them down is the only way the quarterly
 * total is what actually went through the business rather than only the part
 * that happened to go through us. So this deliberately does not ask whoTakes
 * whether Stripe is connected: money already in the till does not need our
 * permission to have been taken.
 */
export async function recordSale(_prev: SellState, fd: FormData): Promise<SellState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const sale = readSale(readLines(fd));
  if (!sale.ok) return { error: sale.because };

  /*
   * Whose takings these are.
   *
   * The form says, and it defaults to whoever is signed in. It matters more
   * than it looks: on the per-person model this is the line between a sale
   * being Sarah's money and being the shop's, and it is the number her tax
   * return is built from.
   */
  let artistId = str(fd, "artist_id") || null;

  if (artistId) {
    const { data: person } = await supabase
      .from("artists")
      .select("id")
      .eq("id", artistId)
      .eq("studio_id", studio.id)
      .maybeSingle();

    if (!person) return { error: "That person is not in this business." };
  } else {
    /*
     * Nobody said, so it is whoever is stood at the desk.
     *
     * Better than leaving it null, which would put the sale in the business's
     * takings and nobody's own — invisible on the per-person export that is
     * the whole reason the column exists. Somebody with no person record of
     * their own, which a receptionist legitimately has, still records the sale
     * and it belongs to the business.
     */
    const { data: mine } = await supabase
      .from("artists")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("user_id", userId)
      .maybeSingle();

    artistId = mine?.id ?? null;
  }

  const contactId = await resolveContact(supabase, studio.id, {
    id: str(fd, "contact_id"),
    name: str(fd, "contact_name"),
  });

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      studio_id: studio.id,
      artist_id: artistId,
      contact_id: contactId,
      kind: "product",
      gross_pence: sale.totalPence,
      /*
       * No fee, and so no net.
       *
       * Nothing was taken by Stripe, so there is nothing to subtract. Writing
       * a zero fee would claim we know the cost of a card-machine transaction,
       * which we do not — that is between the business and whoever sold them
       * the machine, and a made-up zero would quietly overstate every net
       * figure in the export.
       */
      net_pence: null,
      method: readMethod(str(fd, "method")),
      status: "paid",
      description: sale.description,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  /*
   * The lines, so a month can be asked what sells.
   *
   * Written after the payment rather than in one statement because they are
   * two tables. If this half fails the sale still exists with its total and
   * its description, which is the half that matters for the money — a sale
   * that vanished because a line item would not insert would be far worse
   * than one whose breakdown is missing.
   *
   * Skipped entirely until the table exists. The description already carries
   * the sale in words ("2 × Shampoo, Conditioner"), so a sale recorded before
   * the migration is complete rather than broken, and nobody selling a bottle
   * is shown a warning about a table.
   */
  if (await hasColumn(supabase, "payment_items", "unit_pence")) {
    const { error: lineError } = await supabase.from("payment_items").insert(
      sale.lines.map((line, i) => ({
        payment_id: payment.id,
        service_id: line.serviceId,
        name: line.name,
        quantity: line.quantity,
        unit_pence: line.unitPence,
        sort_order: i,
      })),
    );

    if (lineError) {
      return {
        ok: true,
        total: sale.totalPence,
        error: `Recorded, but the breakdown did not save: ${lineError.message}`,
      };
    }
  }

  /*
   * And the shelf goes down by what left it.
   *
   * Only for things the shop is actually counting — a null stock means "not
   * counting these", and turning that into a number the first time one sells
   * would invent a count nobody asked for and then be wrong about it forever.
   *
   * One at a time, and never below nought. A shop that sells its last two
   * bottles in one go and finds minus one on the shelf has learned that the
   * number cannot be trusted, and from then on it is furniture. Getting to
   * nought and stopping is the honest version of the same event.
   *
   * Deliberately after the sale is recorded and deliberately unable to undo
   * it: the money changing hands is the thing that happened, and a stock count
   * that fails to update is a smaller problem than a sale that vanishes.
   */
  if (await hasColumn(supabase, "services", "stock")) {
    for (const line of sale.lines) {
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

  /*
   * A receipt, where there is somebody to send it to.
   *
   * A till sale is the one kind of payment with a person standing in front of
   * you, which is probably why it has never produced anything: they were
   * handed their bottles and that felt like the end of it. It is not — six
   * weeks later "which conditioner was it" is a question the customer cannot
   * answer and neither can the salon.
   *
   * Silent when the contact has no email, which is most walk-ins, and never
   * something anybody has to decide about at the counter. The sale is already
   * recorded by this point either way.
   */
  if (contactId) await sendPaymentReceipt(supabase, payment.id);

  revalidatePath("/diary");
  revalidatePath("/clients");
  revalidatePath("/settings/pricing");
  if (contactId) revalidatePath(`/clients/${contactId}`);

  return { ok: true, total: sale.totalPence };
}
