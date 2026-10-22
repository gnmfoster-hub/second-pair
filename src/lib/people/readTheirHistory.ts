/**
 * Reading the history in lib/people/theirHistory out of the database.
 *
 * Kept apart from the words it turns into, so the judgement about what to say
 * can be tested without a database and this can stay a set of queries.
 *
 * Three queries, all of them small and all of them indexed on a column that
 * is already indexed. It runs once a turn, alongside the enquiry and contact
 * reads that were already happening, so it costs one round trip rather than a
 * whole extra wait.
 *
 * Nothing in here may throw. A conversation that could not load somebody's
 * past is a conversation that should carry on without it, not a customer
 * getting no reply.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPence } from "../money.ts";
import type { TheirHistory, TheirBooking, SaidElsewhere } from "./theirHistory.ts";

type Db = Pick<SupabaseClient, "from">;

type EnquiryRow = {
  conversation_id: string;
  description?: string | null;
  placement?: string | null;
  size_band_id?: string | null;
  cover_up?: boolean | null;
  age_confirmed?: boolean | null;
  preferred_times?: string | null;
  reference_urls?: string[] | null;
  quote_low_pence?: number | null;
  quote_high_pence?: number | null;
};

/**
 * One enquiry as a handful of phrases.
 *
 * Only what somebody would be annoyed to be asked twice. The band is named
 * rather than given as an id, and the photographs are counted rather than
 * listed, because the point of the line is to stop a question being asked and
 * not to brief anybody.
 */
function factsFrom(row: EnquiryRow, bandName: (id: string) => string | null): string[] {
  const facts: string[] = [];
  if (row.description?.trim()) facts.push(`what they want: ${row.description.trim()}`);
  if (row.placement?.trim()) facts.push(`where: ${row.placement.trim()}`);
  const band = row.size_band_id ? bandName(row.size_band_id) : null;
  if (band) facts.push(`size: ${band}`);
  if (row.cover_up != null) facts.push(row.cover_up ? "it is a cover-up" : "not over existing work");
  if (row.age_confirmed) facts.push("confirmed 18 or over");
  if (row.preferred_times?.trim()) facts.push(`when suits them: ${row.preferred_times.trim()}`);
  const photos = row.reference_urls?.length ?? 0;
  if (photos) {
    facts.push(`${photos} reference ${photos === 1 ? "photo" : "photos"} already sent in`);
  }
  if (row.quote_low_pence != null && row.quote_high_pence != null) {
    facts.push(
      `already quoted ${formatPence(row.quote_low_pence)} to ${formatPence(row.quote_high_pence)}`,
    );
  }
  return facts;
}

export async function readTheirHistory(
  db: Db,
  about: {
    studioId: string;
    contactId: string;
    /** The thread being answered, which is not part of its own history. */
    exceptConversationId: string;
    /** Already in memory on every turn; saves a join. */
    artists: { id: string; name: string }[];
    bands: { id: string; size_label?: string | null }[];
    now?: number;
  },
): Promise<TheirHistory> {
  const empty: TheirHistory = { coming: [], visits: 0, elsewhere: [], metBefore: false };
  const now = about.now ?? Date.now();

  try {
    const [{ data: contact }, { data: bookings }, { data: threads }] = await Promise.all([
      db.from("contacts").select("name").eq("id", about.contactId).maybeSingle(),
      db
        .from("bookings")
        .select(
          "id, starts_at, ends_at, title, artist_id, deposit_amount_pence, deposit_status, attended",
        )
        .eq("contact_id", about.contactId)
        .is("cancelled_at", null)
        .order("starts_at"),
      db
        .from("conversations")
        .select("id, channel, last_message_at, created_at")
        .eq("studio_id", about.studioId)
        .eq("contact_id", about.contactId)
        .neq("id", about.exceptConversationId)
        .order("last_message_at", { ascending: false })
        .limit(3),
    ]);

    const named = (id: string | null | undefined) =>
      about.artists.find((a) => a.id === id)?.name ?? null;

    const asBooking = (row: Record<string, unknown>): TheirBooking => ({
      startsAt: String(row.starts_at ?? ""),
      endsAt: (row.ends_at as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      withWhom: named(row.artist_id as string | null),
      depositOwedPence:
        ((row.deposit_amount_pence as number | null) ?? 0) > 0 && row.deposit_status !== "paid"
          ? (row.deposit_amount_pence as number)
          : null,
      attended: (row.attended as boolean | null) ?? null,
    });

    const all = (bookings ?? []).map(asBooking).filter((b) => Date.parse(b.startsAt));
    const coming = all.filter((b) => Date.parse(b.startsAt) >= now);
    /*
     * Been in, rather than booked in the past.
     *
     * A booking whose time has passed is not a visit if they did not come,
     * and "you were last in on the 3rd" said to somebody who missed the 3rd
     * is the sort of thing that loses a customer. Where nobody has marked it
     * either way it counts, because not marking it is what busy people do and
     * most appointments are kept.
     */
    const been = all.filter((b) => Date.parse(b.startsAt) < now && b.attended !== false);

    const elsewhere: SaidElsewhere[] = [];
    const ids = (threads ?? []).map((t) => t.id as string);

    /*
     * Whether the assistant has introduced itself to them before, on any
     * thread of this business but this one, within the last year.
     *
     * A count rather than a read: the question is only ever yes or no, and an
     * exact head count is one index lookup. Their own messages do not count —
     * somebody who wrote in and got no answer has been told nothing.
     */
    const aYearAgo = new Date(now - 365 * 86_400_000).toISOString();
    let metBefore = false;
    if (ids.length) {
      const { count } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids)
        .eq("role", "assistant")
        .gte("created_at", aYearAgo);
      metBefore = (count ?? 0) > 0;
    }

    if (ids.length) {
      const { data: enquiryRows } = await db
        .from("enquiries")
        .select(
          "conversation_id, description, placement, size_band_id, cover_up, age_confirmed, " +
            "preferred_times, reference_urls, quote_low_pence, quote_high_pence",
        )
        .in("conversation_id", ids);

      const bandName = (id: string) =>
        about.bands.find((b) => b.id === id)?.size_label ?? null;

      for (const thread of threads ?? []) {
        const rows = (enquiryRows ?? []) as unknown as EnquiryRow[];
        const row = rows.find((e) => e.conversation_id === thread.id);
        if (!row) continue;
        const facts = factsFrom(row, bandName);
        if (!facts.length) continue;
        elsewhere.push({
          channel: String(thread.channel ?? ""),
          at: String(thread.last_message_at ?? thread.created_at ?? ""),
          facts,
        });
      }
    }

    return {
      name: (contact as { name?: string | null } | null)?.name ?? null,
      coming,
      lastVisit: been.length ? been[been.length - 1] : null,
      visits: been.length,
      elsewhere,
      metBefore,
    };
  } catch (e) {
    console.warn(`could not read who they are: ${(e as Error).message}`);
    return empty;
  }
}
