/**
 * Who did this to this booking, and when.
 *
 * Giles, 15 October, about a walk in Amber's diary: "can you tell me who
 * booked this?" The honest answer was no. The row said `source: "manual"`,
 * which means a person rather than the assistant, and that was everything the
 * database knew — not which person, not when they typed it, not whether
 * anybody had moved it since.
 *
 * Both halves of that are needed and they are different things. A column says
 * what is true now: who made it. A history says what happened: who moved it,
 * who changed the price, who cancelled it. The arguments are always about the
 * second.
 *
 * Three rules this follows, each of them learned the hard way here:
 *
 *   - Nothing in here may fail a save. A booking that did not go in the diary
 *     because its history could not be written would be a worse product than
 *     one with no history at all. Every write below is allowed to fail and
 *     says so in the log.
 *   - The column may not exist yet. Migrations are run by hand, and PostgREST
 *     refuses the whole statement for one unknown column — so the insert asks
 *     first, and a diary that is ahead of its migration simply records
 *     nothing.
 *   - The name is frozen at the time rather than looked up later. Somebody
 *     leaves, their row is renamed or deleted, and a history that joins would
 *     quietly rewrite itself. What it said last year is what it should say.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
/* Relative, with the extension: the tests load this file in node directly, and
 * the "@/" alias is a bundler's idea rather than node's. */
import { hasColumn } from "./db/hasColumn.ts";

/** The person behind a request, or nobody where the system acted alone. */
export type Actor = { id: string | null; name: string | null };

/** What happened. A short phrase, because it is read by people. */
export type Happening =
  | "booked"
  | "moved"
  | "changed"
  | "price changed"
  | "cancelled"
  | "finished";

/** What was driving. Who did it is the actor; this is which door they came in. */
export type Doorway = "diary" | "assistant" | "customer" | "payment" | "system";

type Db = Pick<SupabaseClient, "from">;

/**
 * The signed-in person, named the way the diary names them.
 *
 * requireStudio gives an id and an email and no name, because there is no
 * users table here worth the word — the only place a login has a name against
 * it is the team list, through artists.user_id. Where that finds nothing the
 * email is used, which is ugly and true; "somebody" would be neither.
 */
export async function whoIsActing(
  db: Db,
  studioId: string,
  userId: string,
  userEmail?: string,
): Promise<Actor> {
  const { data } = await db
    .from("artists")
    .select("name")
    .eq("studio_id", studioId)
    .eq("user_id", userId)
    .maybeSingle();

  const name = (data as { name?: string | null } | null)?.name ?? null;
  return { id: userId, name: name || userEmail || null };
}

/**
 * The two columns to put on a new booking, or nothing if they are not there.
 *
 * Spread into an insert: `{ ...base, ...(await madeBy(db, who)) }`. Returning
 * an object rather than writing anything keeps it inside the insert that is
 * already happening, which is one less round trip and one less way for a
 * booking to exist with no record of who made it.
 */
export async function madeBy(db: Db, who: Actor | null): Promise<Record<string, string | null>> {
  if (!who) return {};
  if (!(await hasColumn(db, "bookings", "created_by"))) return {};
  return { created_by: who.id, created_by_name: who.name };
}

/**
 * Write one line of history, for one booking or for a whole run of them.
 *
 * Never throws and never returns a failure: the caller has already done the
 * thing being recorded, and there is nothing useful it could do about this.
 */
export async function recordBookingEvent(
  db: Db,
  event: {
    /** One booking, or every booking a single press affected. */
    bookings: string | (string | null | undefined)[];
    what: Happening;
    /** Absent for the assistant and the nightly jobs, which are nobody. */
    by?: Actor | null;
    source: Doorway;
    /** Anything worth knowing later: the old time, the old price, a reason. */
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  const ids = (Array.isArray(event.bookings) ? event.bookings : [event.bookings]).filter(
    (id): id is string => Boolean(id),
  );
  if (!ids.length) return;

  try {
    /*
     * The table, not a column, and asked about by the column that must be in
     * it. hasColumn remembers a yes for the life of the process and re-asks a
     * no once a minute, so this costs one query until the migration is run and
     * nothing at all afterwards.
     */
    if (!(await hasColumn(db, "booking_events", "booking_id"))) return;

    const { error } = await db.from("booking_events").insert(
      ids.map((booking_id) => ({
        booking_id,
        what: event.what,
        by_user: event.by?.id ?? null,
        by_name: event.by?.name ?? null,
        source: event.source,
        detail: event.detail ?? null,
      })),
    );

    /*
     * Said out loud rather than swallowed.
     *
     * Four separate faults this month were an unread error from this exact
     * shape of call. It cannot be thrown — the booking is already saved — so
     * the log is the only place left for it to go.
     */
    if (error) console.warn(`booking history not written: ${error.message}`);
  } catch (e) {
    console.warn(`booking history not written: ${(e as Error).message}`);
  }
}
