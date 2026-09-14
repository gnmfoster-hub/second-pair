import type { SupabaseClient } from "@supabase/supabase-js";
import { hasColumn } from "@/lib/db/hasColumn";

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
    byPerson: { id: string; name: string; count: number; pence: number }[];
    byItem: {
      name: string;
      count: number;
      pence: number;
      /**
       * What those cost the shop, where a cost has been recorded against the
       * product. Null means nobody has said — which is not nought, and the
       * difference matters: nought would report the whole sale as profit.
       */
      costPence: number | null;
    }[];
    /**
     * Takings less what the stock cost, across everything where both are
     * known. Null where nothing has a cost on it yet, so the screen can say
     * "you have not told us what these cost" rather than "you made £0".
     */
    madePence: number | null;
  };
};

/** Nothing sold, which is what a business with no till activity looks like. */
const NO_SALES: Takings["sales"] = {
  count: 0,
  pence: 0,
  byPerson: [],
  byItem: [],
  madePence: null,
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

  const { data, error } = await db
    .from("payments")
    .select("id, gross_pence, artist_id, artists(name)")
    .eq("studio_id", studioId)
    .eq("kind", "product")
    .eq("status", "paid")
    .gte("paid_at", from.toISOString())
    .lt("paid_at", to.toISOString());

  if (error) return NO_SALES;

  const rows = (data ?? []) as unknown as {
    id: string;
    gross_pence: number | null;
    artist_id: string | null;
    artists: { name: string } | null;
  }[];

  const people = new Map<string, { name: string; count: number; pence: number }>();
  let pence = 0;

  for (const row of rows) {
    pence += row.gross_pence ?? 0;
    // A sale nobody is named on belongs to the shop, and is counted in the
    // total without inventing a person to attribute it to.
    if (!row.artist_id) continue;

    const who = people.get(row.artist_id) ?? {
      name: row.artists?.name ?? "Somebody",
      count: 0,
      pence: 0,
    };
    who.count += 1;
    who.pence += row.gross_pence ?? 0;
    people.set(row.artist_id, who);
  }

  const byItem = await soldItems(db, rows.map((r) => r.id));

  return {
    count: rows.length,
    pence,
    byPerson: [...people.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.pence - a.pence),
    byItem,
    /*
     * What the shelf actually made.
     *
     * Only across the things with a cost recorded, and null where none of them
     * has one — so the screen can say "you have not told us what these cost"
     * instead of "you made nothing", which is a different and much more
     * alarming sentence.
     */
    madePence: byItem.some((i) => i.costPence != null)
      ? byItem.reduce(
          (made, i) => (i.costPence == null ? made : made + i.pence - i.costPence),
          0,
        )
      : null,
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
async function soldItems(
  db: SupabaseClient,
  paymentIds: string[],
): Promise<Takings["sales"]["byItem"]> {
  if (!paymentIds.length) return [];
  if (!(await hasColumn(db, "payment_items", "unit_pence"))) return [];

  const { data } = await db
    .from("payment_items")
    .select("name, quantity, unit_pence, service_id")
    .in("payment_id", paymentIds);

  const lines = (data ?? []) as {
    name: string;
    quantity: number;
    unit_pence: number;
    service_id: string | null;
  }[];

  /*
   * What the shop paid for the stock, where it has said.
   *
   * Read from the product rather than copied onto the line, unlike the name
   * and the price. Those are what the customer was told and must not change;
   * this is the shop's own figure and the most recent one is the one they
   * would use. A bottle bought cheaper this month is genuinely cheaper this
   * month.
   *
   * Guarded on the column, because the line items arrived before the cost did
   * and a report is the wrong place to discover a missing migration.
   */
  const ids = [...new Set(lines.map((l) => l.service_id).filter(Boolean))] as string[];
  const costs = new Map<string, number | null>();

  if (ids.length && (await hasColumn(db, "services", "cost_pence"))) {
    const { data: products } = await db
      .from("services")
      .select("id, cost_pence")
      .in("id", ids);

    for (const p of products ?? []) {
      costs.set(p.id as string, (p.cost_pence as number | null) ?? null);
    }
  }

  const totals = new Map<string, { count: number; pence: number; costPence: number | null }>();

  for (const row of lines) {
    const t = totals.get(row.name) ?? { count: 0, pence: 0, costPence: null };
    t.count += row.quantity;
    t.pence += row.quantity * row.unit_pence;

    /*
     * Nought is a real cost and absent is not, so they are kept apart the
     * whole way up. A line with no cost against it leaves this null rather
     * than adding nothing, which would quietly report it as all profit.
     */
    const each = row.service_id ? costs.get(row.service_id) : null;
    if (each != null) t.costPence = (t.costPence ?? 0) + row.quantity * each;

    totals.set(row.name, t);
  }

  return [...totals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.pence - a.pence);
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
