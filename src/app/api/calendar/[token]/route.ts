import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCalendar, type CalendarEvent } from "@/lib/ics";
import { categoryFor } from "@/lib/calendar";

export const runtime = "nodejs";
// Never cached at the edge: the whole point is that it reflects the diary now,
// and a stale copy served to a subscriber is invisible and unfixable.
export const dynamic = "force-dynamic";

/** How far either side of today to publish. */
const WEEKS_BACK = 8;
const WEEKS_AHEAD = 52;

/**
 * The diary, as a calendar anyone can subscribe to.
 *
 * Deliberately outside the session: a calendar app cannot log in, so the token
 * in the URL is the credential. It is 64 random hex characters, unique, and
 * rotatable — rotating it is how a lost subscription is revoked.
 *
 * The token may belong to a whole business or to one person, which is how a
 * stylist subscribes to their own column without seeing everyone else's.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Cheap shape check before touching the database, so a scan of short
  // guesses costs nothing.
  if (!/^[0-9a-f]{64}$/.test(token.replace(/\.ics$/, ""))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const key = token.replace(/\.ics$/, "");

  const db = createAdminClient();

  const [{ data: studio }, { data: person }] = await Promise.all([
    db.from("studios").select("id, name, timezone").eq("calendar_token", key).maybeSingle(),
    db
      .from("artists")
      .select("id, name, studio_id, studios(name)")
      .eq("calendar_token", key)
      .maybeSingle(),
  ]);

  if (!studio && !person) return new NextResponse("Not found", { status: 404 });

  // PostgREST types a nested select loosely; the shape is known here.
  const owner = person as unknown as
    | { id: string; name: string; studio_id: string; studios?: { name: string } | null }
    | null;

  const studioId = studio?.id ?? owner!.studio_id;
  const label = studio ? studio.name : `${owner!.name} · ${owner!.studios?.name ?? ""}`.trim();

  const from = new Date(Date.now() - WEEKS_BACK * 7 * 86400_000);
  const to = new Date(Date.now() + WEEKS_AHEAD * 7 * 86400_000);

  const { data: team } = await db.from("artists").select("id, name").eq("studio_id", studioId);
  const mine = owner ? [owner.id] : (team ?? []).map((a) => a.id);
  if (mine.length === 0) {
    return calendar(label, []);
  }

  const { data: rows } = await db
    .from("bookings")
    .select(
      "id, artist_id, starts_at, ends_at, all_day, category, title, notes, cancelled_at, updated_at, " +
        "enquiries(description, job_address, conversations(contacts(name, phone)))",
    )
    .in("artist_id", mine)
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at");

  const names = new Map((team ?? []).map((a) => [a.id, a.name]));

  type Row = {
    id: string;
    artist_id: string;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    category: string;
    title: string | null;
    notes: string | null;
    cancelled_at: string | null;
    updated_at: string | null;
    enquiries: {
      description: string | null;
      job_address: string | null;
      conversations: { contacts: { name: string | null; phone: string | null } | null } | null;
    } | null;
  };

  const events: CalendarEvent[] = ((rows ?? []) as unknown as Row[]).map((row) => {
    const enquiry = row.enquiries;

    const client = enquiry?.conversations?.contacts;
    const category = categoryFor(row.category);
    const who = names.get(row.artist_id);

    const summary = row.title ?? client?.name ?? category.label;

    // Everything the owner would want on their phone when the reminder goes
    // off, and nothing they would not want read aloud by a car.
    const detail = [
      enquiry?.description,
      client?.phone ? `Phone: ${client.phone}` : null,
      // Only worth naming when there is more than one of them.
      !owner && (team ?? []).length > 1 && who ? `With ${who}` : null,
      row.notes,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      // Stable and globally unique, so refreshing updates rather than
      // duplicating, and two businesses cannot collide in one calendar.
      uid: `${row.id}@secondpair`,
      starts: new Date(row.starts_at),
      ends: new Date(row.ends_at),
      allDay: row.all_day,
      summary,
      description: detail || undefined,
      location: enquiry?.job_address ?? undefined,
      updated: new Date(row.updated_at ?? row.starts_at),
      // Kept rather than dropped, so a cancellation removes it from the
      // subscriber's calendar instead of leaving a ghost behind.
      cancelled: Boolean(row.cancelled_at),
    };
  });

  return calendar(label, events);
}

function calendar(name: string, events: CalendarEvent[]) {
  const body = buildCalendar({
    name: `${name} — Second Pair`,
    description: "Your Second Pair diary. Changes here are not sent back.",
    events,
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="second-pair.ics"',
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
