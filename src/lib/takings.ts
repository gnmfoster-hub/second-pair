import type { SupabaseClient } from "@supabase/supabase-js";

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
  };
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
