import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRows } from "./platform";
import { everyUser } from "@/lib/auth/everyUser";

/**
 * Every row the platform report reads, for a range, with the service key.
 *
 * Paged, because Supabase returns a thousand rows at a time and a quarter of
 * messages across twenty businesses is more than that — a report that quietly
 * stopped counting at a thousand would be wrong in the direction nobody checks.
 *
 * Nothing a customer said is read: messages are fetched for their role, time,
 * cost and whether they were delivered, never their words.
 */
async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await query(page * 1000, page * 1000 + 999);
    if (error) break;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadPlatformRows(db: SupabaseClient, range: { from: string; to: string }): Promise<ReportRows> {
  const quarterAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [studios, conversations, messages, bookings, payments, inbound, reminders, forms, calls, members, people, users] = await Promise.all([
    /*
     * Whole, for the same reason as artists below: receptionist_allowed and
     * receptionist_on decide what is chargeable, and a named-column query
     * refuses everything the moment one of them is not there yet.
     */
    all((a, b) => db.from("studios").select("*").range(a, b)),
    /*
     * The ones this report can actually say something about.
     *
     * Every conversation ever made was read on every run, to produce a report
     * about thirty days. At nineteen conversations that is invisible; at a
     * hundred businesses it is the report timing out, and the failure arrives
     * all at once on the day it arrives.
     *
     * Either started in the window, or spoken on in it — a thread opened in
     * March that got a reply yesterday belongs in yesterday's figures, and
     * filtering on created_at alone would drop its messages on the floor.
     */
    all((a, b) =>
      db
        .from("conversations")
        .select("id, studio_id, channel, is_test, created_at, first_response_ms, status, last_message_at")
        .or(`created_at.gte.${range.from},last_message_at.gte.${range.from}`)
        .range(a, b),
    ),
    all((a, b) =>
      db
        .from("messages")
        .select("conversation_id, role, created_at, usage, delivery")
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .range(a, b),
    ),
    all((a, b) =>
      db
        .from("bookings")
        .select("created_at, cancelled_at, attended, source, starts_at, artists!inner(studio_id)")
        .or(`created_at.gte.${quarterAgo},starts_at.gte.${range.from}`)
        .range(a, b),
    ),
    all((a, b) =>
      db.from("payments").select("studio_id, kind, status, gross_pence, fee_pence, paid_at").gte("created_at", range.from).range(a, b),
    ),
    all((a, b) => db.from("inbound_emails").select("studio_id, verdict, because, at").gte("at", range.from).lt("at", range.to).range(a, b)),
    all((a, b) =>
      db
        .from("reminders")
        .select("status, channel, created_at, bookings!inner(artists!inner(studio_id))")
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .range(a, b),
    ),
    // Forms may not exist yet; a failed query is simply no forms.
    all((a, b) => db.from("client_forms").select("studio_id, status, created_at, signed_at").gte("created_at", quarterAgo).range(a, b)),
    // Nor calls, until their migration runs. `all` stops on the first error,
    // so an absent table is an empty list rather than a broken report.
    all((a, b) =>
      db
        .from("calls")
        .select("studio_id, at, rang_seconds, forwarded, answered, recorded_seconds, transcribed, artist_id")
        .gte("at", range.from)
        .lt("at", range.to)
        .range(a, b),
    ),
    all((a, b) => db.from("studio_members").select("studio_id, user_id").range(a, b)),
    /*
     * Read whole, because voice_on is what says somebody has a Receptionist
     * and naming a column PostgREST does not know refuses the entire query —
     * which would take the names with it and leave every call priced against
     * a uuid. See the migration: a deploy can land before it is run.
     */
    all((a, b) => db.from("artists").select("*").range(a, b)),
    everyUser(db),
  ]);

  /*
   * When each business was last heard from, over all time.
   *
   * "Quiet for fourteen days" is the at-risk signal, and it cannot be worked
   * out from a thirty-day window — a business silent since June has nothing in
   * it at all. Its own query, two columns wide, newest first: whatever the
   * newest few thousand are, they contain the latest for every business that
   * has ever said anything.
   */
  const { data: heardFrom } = await db
    .from("conversations")
    .select("studio_id, last_message_at, is_test")
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(3000);

  const signIn = new Map(users.map((u) => [u.id, u.last_sign_in_at ?? null]));
  const lastSignIn: Record<string, string | null> = {};
  for (const m of members as { studio_id: string; user_id: string }[]) {
    const at = signIn.get(m.user_id) ?? null;
    if (at && (!lastSignIn[m.studio_id] || at > lastSignIn[m.studio_id]!)) lastSignIn[m.studio_id] = at;
    if (!(m.studio_id in lastSignIn)) lastSignIn[m.studio_id] = null;
  }

  const bookingRows = (bookings as unknown as { created_at: string; cancelled_at: string | null; attended: boolean | null; source: string | null; starts_at: string; artists: { studio_id: string } }[]).map(
    (b) => ({ ...b, studio_id: b.artists.studio_id }),
  );

  // The last thing that happened: a message in or out, or a booking made.
  const lastActivity: Record<string, string | null> = {};
  const later = (id: string, at: string | null | undefined) => {
    if (at && (!lastActivity[id] || at > lastActivity[id]!)) lastActivity[id] = at;
  };
  for (const c of (heardFrom ?? []) as { studio_id: string; last_message_at: string | null; is_test: boolean | null }[]) {
    if (!c.is_test) later(c.studio_id, c.last_message_at);
  }
  for (const b of bookingRows) if (b.source !== "block") later(b.studio_id, b.created_at);

  return {
    studios: studios as ReportRows["studios"],
    conversations: conversations as ReportRows["conversations"],
    messages: messages as ReportRows["messages"],
    bookings: bookingRows,
    payments: payments as ReportRows["payments"],
    inbound: inbound as ReportRows["inbound"],
    reminders: (reminders as unknown as { status: string; channel: string | null; created_at: string; bookings: { artists: { studio_id: string } } }[]).map((r) => ({
      status: r.status,
      channel: r.channel,
      created_at: r.created_at,
      studio_id: r.bookings.artists.studio_id,
    })),
    forms: forms as ReportRows["forms"],
    calls: calls as ReportRows["calls"],
    people: people as ReportRows["people"],
    lastSignIn,
    lastActivity,
  };
}
