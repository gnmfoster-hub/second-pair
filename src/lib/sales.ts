/**
 * What is in a sale, and what it comes to.
 *
 * Pure, and kept away from anything that talks to a database or to Stripe,
 * because "what does this come to" is the one part of taking money that is
 * worth being able to test without a network — and the one part where being
 * wrong is noticed by a customer holding a card.
 *
 * Everything is integer pence. No money in this product is ever a float: a
 * till that is a penny out at the end of a week is a till nobody trusts, and
 * 0.1 + 0.2 is exactly how that happens.
 */

export type SaleLine = {
  /** The product on the price list, if it came from there. */
  serviceId: string | null;
  /** What it was called at the time. Copied, not looked up later. */
  name: string;
  quantity: number;
  unitPence: number;
};

export type Sale =
  | { ok: true; lines: SaleLine[]; totalPence: number; description: string }
  | { ok: false; because: string };

/** What one line comes to. */
export function lineTotal(line: Pick<SaleLine, "quantity" | "unitPence">): number {
  return line.quantity * line.unitPence;
}

/**
 * A sale, from whatever the form sent.
 *
 * Refuses rather than rounds. A sale with nothing in it, a quantity of zero or
 * a price that is not a number are all somebody's mistake rather than a sale
 * worth half-recording, and the till is the wrong place to be forgiving.
 */
export function readSale(raw: readonly Partial<SaleLine>[]): Sale {
  const lines: SaleLine[] = [];

  for (const item of raw) {
    const name = String(item.name ?? "").trim();
    const quantity = Number(item.quantity ?? 0);
    const unitPence = Number(item.unitPence ?? Number.NaN);

    // A blank row is somebody who added a line and changed their mind, which
    // is not an error — it is just not part of the sale.
    if (!name && !Number.isFinite(unitPence)) continue;

    if (!name) return { ok: false, because: "Every line needs a name." };

    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, because: `How many ${name}?` };
    }

    if (!Number.isInteger(unitPence) || unitPence < 0) {
      return { ok: false, because: `${name} needs a price.` };
    }

    lines.push({ serviceId: item.serviceId ?? null, name, quantity, unitPence });
  }

  if (lines.length === 0) {
    return { ok: false, because: "Nothing has been added to this sale yet." };
  }

  const totalPence = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  /*
   * The sale in one line of words.
   *
   * Written down on the payment itself as well as in the lines, because this
   * is what shows on a client's record, in a list of takings and on a
   * downloaded file — all places that show one row per payment and have
   * nowhere to put four. "2 × Shampoo, Conditioner" is what somebody needs to
   * recognise the transaction six weeks later.
   */
  const description = lines
    .map((l) => (l.quantity > 1 ? `${l.quantity} × ${l.name}` : l.name))
    .join(", ");

  return { ok: true, lines, totalPence, description };
}

/**
 * How the money was taken.
 *
 * Recorded rather than processed. Cash and a card machine both happen entirely
 * outside this product, and writing them down is bookkeeping — it is what
 * makes the end-of-quarter file add up to what actually went through the
 * business, instead of only the part that happened to go through us.
 */
export const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card machine" },
  /*
   * A card tapped on somebody's own phone, through Stripe's app.
   *
   * Its own method rather than "card machine", because the two look identical
   * at the desk and are not the same thing afterwards: a tap through Stripe is
   * already in this business's Stripe account and will appear in its payouts,
   * and a third-party card terminal never touches Stripe at all. Recording
   * both as "card" makes a month impossible to reconcile against a Stripe
   * statement — half the rows are in it and half are not, and nothing says
   * which half.
   */
  { value: "phone", label: "Tapped on a phone" },
  { value: "other", label: "Something else" },
] as const;

export function readMethod(raw: string): string {
  return METHODS.some((m) => m.value === raw) ? raw : "other";
}

/**
 * A price somebody typed in pounds, as integer pence.
 *
 * Everything downstream is pence and the conversion happens once, at the edge
 * where a person typed something. Not-a-number rather than nought for a blank:
 * "they paid nothing" and "nobody said" are different answers and readSale
 * refuses the second one.
 */
export function penceOf(raw: string): number {
  const clean = raw.replace(/[£,\s]/g, "");
  if (!clean) return Number.NaN;
  const pounds = Number(clean);
  if (!Number.isFinite(pounds)) return Number.NaN;
  return Math.round(pounds * 100);
}

/**
 * The lines of a sale, as a form describes them.
 *
 * Indexed field names rather than a JSON blob, for the same reason the group
 * form uses them: it works without JavaScript, and a half-filled row shows up
 * in the request rather than inside a string somebody has to unpick.
 *
 * Here rather than beside one of the forms because three screens now build a
 * sale — the till, an appointment, and closing one off — and a second copy of
 * this is how two of them end up disagreeing about what a blank row means.
 */
export function linesFromForm(
  get: (key: string) => string | null,
  howMany = 30,
): Partial<SaleLine>[] {
  const str = (key: string) => String(get(key) ?? "").trim();
  const lines: Partial<SaleLine>[] = [];

  for (let i = 0; i < howMany; i++) {
    const name = str(`name_${i}`);
    const price = str(`price_${i}`);
    if (!name && !price) continue;

    lines.push({
      serviceId: str(`service_${i}`) || null,
      name,
      quantity: Number(str(`qty_${i}`) || "1"),
      unitPence: penceOf(price),
    });
  }

  return lines;
}
