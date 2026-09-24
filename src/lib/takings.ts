import type { SupabaseClient } from "@supabase/supabase-js";
import { hasColumn } from "@/lib/db/hasColumn";
import { splitSale } from "@/lib/splitSale";

/**
 * What the week was actually worth, and who did it.
 *
 * The weekly report reads bookings through conversations, which is right for
 * what it measures — work the assistant won, and what it recovered from
 * enquiries that arrived out of hours. It is wrong for "what did we take",
 * because a booking typed into the diary by hand has no conversation and no
 * enquiry, and is therefore invisible to all of it.
 *
 * On the demo salon that is 108 bookings out of 111. In a real salon it is
 * most of the week: the phone rings, somebody writes it in the book, and none
 * of it existed as far as the money figures were concerned.
 *
 * So this asks the diary directly. Everything not cancelled, whoever booked it
 * and however it arrived.
 */

export type Takings = {
  /** Everything in the window, cancelled excluded. */
  bookings: number;
  /** What they come to, where a price is known. */
  pence: number;
  /** How many had no price on them at all. */
  unpriced: number;
  byPerson: { id: string; name: string; bookings: number; pence: number }[];
  /** Only where a business prices by a named list. Empty otherwise. */
  byService: { name: string; bookings: number; pence: number }[];
  /**
   * Money taken over the counter: a bottle off the shelf, a voucher, a walk-in
   * paying cash. Nothing to do with the diary, and in a salon it is a real
   * slice of the week.
   *
   * Counted separately rather than folded in, because "we did forty
   * appointments" and "we took two thousand pounds" are different sentences,
   * and adding a shampoo to the first one makes it untrue.
   */
  sales: {
    count: number;
    pence: number;
    /**
     * Everything taken against an appointment — the work and whatever was
     * bought with it — as against `pence` above, which is the shelf half only.
     *
     * A different question from what the diary was worth, and the one closing
     * an appointment off exists to answer: booked two thousand four hundred,
     * took two thousand one hundred and ninety.
     */
    taken: number;
    byPerson: { id: string; name: string; count: number; pence: number }[];
    byItem: {
      name: string;
      count: number;
      pence: number;
    }[];
  };
};

/** Nothing sold, which is what a business with no till activity looks like. */
const NO_SALES: Takings["sales"] = {
  count: 0,
  pence: 0,
  taken: 0,
  byPerson: [],
  byItem: [],
};

type Row = {
  price_pence: number | null;
  artist_id: string;
  artists: { name: string } | null;
  enquiries: { service_id: string | null } | null;
};

export async function takingsFor(
  db: SupabaseClient,
  studioId: string,
  from: Date,
  to: Date,
): Promise<Takings> {
  /*
   * Joined through artists rather than filtered on a studio column, because
   * bookings do not carry one — whose diary it is, is what makes it theirs.
   * The !inner matters: without it a booking whose artist is missing would
   * come back with a null join and be counted for nobody.
   */
  const { data, error } = await db
    .from("bookings")
    .select(
      "price_pence, artist_id, artists!inner(name, studio_id), enquiries(service_id)",
    )
    .eq("artists.studio_id", studioId)
    .is("cancelled_at", null)
    .eq("blocks_availability", true)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString());

  if (error) throw new Error(`Could not read the takings: ${error.message}`);

  const rows = (data ?? []) as unknown as Row[];

  const people = new Map<string, { name: string; bookings: number; pence: number }>();
  let pence = 0;
  let unpriced = 0;

  for (const row of rows) {
    if (row.price_pence == null) unpriced += 1;
    else pence += row.price_pence;

    const who = people.get(row.artist_id) ?? {
      name: row.artists?.name ?? "Somebody",
      bookings: 0,
      pence: 0,
    };
    who.bookings += 1;
    who.pence += row.price_pence ?? 0;
    people.set(row.artist_id, who);
  }

  return {
    bookings: rows.length,
    pence,
    unpriced,
    // Most money first, because that is the order somebody reads it in.
    byPerson: [...people.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.pence - a.pence),
    byService: [],
    sales: await salesFor(db, studioId, from, to),
  };
}

/**
 * What was sold over the counter in the same window.
 *
 * Separate query because it is a separate table and a separate idea: a sale
 * has no time, blocks nothing, and belongs to whoever made it rather than to a
 * diary. Folding it into the booking query would mean pretending a bottle of
 * shampoo is a forty-minute appointment.
 *
 * Guarded, because payments and their line items arrive with a migration. A
 * report is the wrong screen to take down over a table that is not there yet —
 * on a deploy that lands before its migration this reads as a quiet week for
 * the shelf rather than as an error page over the whole week's figures.
 */
export async function salesFor(
  db: SupabaseClient,
  studioId: string,
  from: Date,
  to: Date,
): Promise<Takings["sales"]> {
  if (!(await hasColumn(db, "payments", "gross_pence"))) return NO_SALES;

  /*
   * Counter sales and bills, which are two shapes of the same money.
   *
   * This asked for kind = product, which was every sale there was while the
   * till was the only thing that could take money outside a deposit. Closing
   * an appointment off now writes one payment for the work and whatever they
   * bought with it — kind = payment — so leaving the filter alone would have
   * meant a salon taking two hundred pounds at the desk on a Saturday and a
   * week's takings that had never heard of it.
   */
  const { data, error } = await db
    .from("payments")
    .select("id, kind, gross_pence, artist_id, artists(name)")
    .eq("studio_id", studioId)
    .in("kind", ["product", "payment"])
    .eq("status", "paid")
    .gte("paid_at", from.toISOString())
    .lt("paid_at", to.toISOString());

  if (error) return NO_SALES;

  const rows = (data ?? []) as unknown as {
    id: string;
    kind: string;
    gross_pence: number | null;
    artist_id: string | null;
    artists: { name: string } | null;
  }[];

  /*
   * The lines first, because a bill has to be split before it can be counted.
   *
   * Only lines pointing at a row on the price list, which a shelf item always
   * does and the work on a bill never does. That is the discriminator for both
   * halves below: what a bill sold, and what sells.
   */
  const lines = await soldLines(db, rows.map((r) => r.id));

  const people = new Map<string, { name: string; count: number; pence: number }>();
  let pence = 0;
  let taken = 0;
  let count = 0;

  for (const row of rows) {
    /*
     * Worked out in splitSale, where the arithmetic can be tested without a
     * database — it is the sort that gets checked with a calculator by
     * somebody who has noticed their figures are wrong.
     */
    const { shelfPence: shelf, takenPence } = splitSale({
      kind: row.kind,
      grossPence: row.gross_pence,
      shelfLines: (lines.get(row.id) ?? []).map((l) => ({
        quantity: l.quantity,
        unitPence: l.unit_pence,
      })),
    });

    taken += takenPence;

    if (shelf <= 0) continue;
    pence += shelf;
    count += 1;

    // A sale nobody is named on belongs to the shop, and is counted in the
    // total without inventing a person to attribute it to.
    if (!row.artist_id) continue;

    const who = people.get(row.artist_id) ?? {
      name: row.artists?.name ?? "Somebody",
      count: 0,
      pence: 0,
    };
    who.count += 1;
    who.pence += shelf;
    people.set(row.artist_id, who);
  }

  /*
   * What sells, off the same lines.
   *
   * A bill carries the work beside the bottles, and the work is not something
   * the shop sells off a shelf — leaving it in would put "Cut and blow dry" at
   * the top of a list whose whole question is which products move.
   */
  const totals = new Map<string, { count: number; pence: number }>();

  for (const of_ of lines.values()) {
    for (const line of of_) {
      const t = totals.get(line.name) ?? { count: 0, pence: 0 };
      t.count += line.quantity;
      t.pence += line.quantity * line.unit_pence;
      totals.set(line.name, t);
    }
  }

  return {
    /*
     * How many sales there were: payments with something off the shelf in
     * them, rather than how many payments were taken at all.
     *
     * Counted alongside the total rather than added up from byPerson, which
     * was the first shape of this and quietly wrong — a sale with nobody named
     * on it belongs to the shop and never reaches that map, so a Saturday of
     * shop sales would have reported none.
     */
    count,
    pence,
    taken,
    byPerson: [...people.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.pence - a.pence),
    byItem: [...totals.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.pence - a.pence),
  };
}

/**
 * What actually sold, by name.
 *
 * The question a shop asks at the end of a month and could not ask before:
 * not "how much did the shelf make" but "what is worth reordering". Read from
 * the names copied onto the lines at the time, so a product renamed in March
 * does not rewrite February.
 */
async function soldLines(
  db: SupabaseClient,
  paymentIds: string[],
): Promise<Map<string, { name: string; quantity: number; unit_pence: number }[]>> {
  const empty = new Map<string, { name: string; quantity: number; unit_pence: number }[]>();
  if (!paymentIds.length) return empty;
  if (!(await hasColumn(db, "payment_items", "unit_pence"))) return empty;

  /*
   * Only lines that point at a row on the price list.
   *
   * That is what separates a bottle off the shelf from the work on a bill and
   * from something typed at the till on the spot. The first is a product sale;
   * the second is already counted in the diary's own figure; the third has no
   * name on the price list to group under and would be a category of one.
   */
  const { data } = await db
    .from("payment_items")
    .select("payment_id, name, quantity, unit_pence, service_id")
    .in("payment_id", paymentIds)
    .not("service_id", "is", null);

  const by = new Map<string, { name: string; quantity: number; unit_pence: number }[]>();

  for (const row of (data ?? []) as {
    payment_id: string;
    name: string;
    quantity: number;
    unit_pence: number;
  }[]) {
    const list = by.get(row.payment_id) ?? [];
    list.push({ name: row.name, quantity: row.quantity, unit_pence: row.unit_pence });
    by.set(row.payment_id, list);
  }

  return by;
}

/**
 * The same week, broken down by what was sold.
 *
 * Separate because it needs the service names and only means anything for a
 * business pricing by a named list — a tattooist's work is priced by the hour
 * and does not group this way.
 */
export async function takingsByService(
  db: SupabaseClient,
  studioId: string,
  from: Date,
  to: Date,
): Promise<Takings["byService"]> {
  const { data } = await db
    .from("bookings")
    .select("price_pence, artists!inner(studio_id), enquiries!inner(service_id)")
    .eq("artists.studio_id", studioId)
    .is("cancelled_at", null)
    .not("enquiries.service_id", "is", null)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString());

  const ids = [
    ...new Set(
      ((data ?? []) as unknown as { enquiries: { service_id: string } }[]).map(
        (r) => r.enquiries.service_id,
      ),
    ),
  ];

  if (!ids.length) return [];

  const { data: services } = await db.from("services").select("id, name").in("id", ids);
  const names = new Map((services ?? []).map((s) => [s.id as string, s.name as string]));

  const totals = new Map<string, { bookings: number; pence: number }>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const id = row.enquiries?.service_id;
    if (!id) continue;
    const name = names.get(id) ?? "Something";
    const t = totals.get(name) ?? { bookings: 0, pence: 0 };
    t.bookings += 1;
    t.pence += row.price_pence ?? 0;
    totals.set(name, t);
  }

  return [...totals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.pence - a.pence);
}

/**
 * What was sold over the counter, and what it made.
 *
 * Joins what actually went through the till to what the business says each
 * thing costs them. Both halves have existed for weeks: payment_items records
 * every line sold, services.cost_pence records what it cost, and nothing had
 * ever put the two together — found by auditing the database for columns the
 * product stores and never reads.
 *
 * Only paid items. A payment link nobody has clicked is not a sale, and
 * counting it would report a margin on money that has not arrived.
 */
export async function soldWithCost(
  db: SupabaseClient,
  studioId: string,
  from: Date,
  to: Date,
): Promise<{ name: string; quantity: number; unitPence: number; costPence: number | null }[]> {
  const { data: paid } = await db
    .from("payments")
    .select("id")
    .eq("studio_id", studioId)
    .eq("status", "paid")
    .gte("paid_at", from.toISOString())
    .lt("paid_at", to.toISOString());

  const ids = (paid ?? []).map((p) => p.id as string);
  if (!ids.length) return [];

  const { data: items } = await db
    .from("payment_items")
    .select("name, quantity, unit_pence, service_id")
    .in("payment_id", ids);

  const rows = (items ?? []) as {
    name: string;
    quantity: number;
    unit_pence: number;
    service_id: string | null;
  }[];

  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter(Boolean))] as string[];

  /*
   * Read tolerantly: cost_pence is optional on a service and the whole feature
   * is worth nothing to a business that has not filled it in, which must not
   * be the same as the report failing.
   */
  const costs = new Map<string, number | null>();
  if (serviceIds.length) {
    const { data: services } = await db
      .from("services")
      .select("id, cost_pence")
      .in("id", serviceIds);

    for (const s of services ?? []) {
      costs.set(s.id as string, (s.cost_pence as number | null) ?? null);
    }
  }

  return rows.map((r) => ({
    name: r.name,
    quantity: r.quantity ?? 1,
    unitPence: r.unit_pence ?? 0,
    costPence: r.service_id ? (costs.get(r.service_id) ?? null) : null,
  }));
}
