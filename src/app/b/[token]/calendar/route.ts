import { createAdminClient } from "@/lib/supabase/admin";
import { buildCalendar } from "@/lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One appointment, as a file a phone knows what to do with.
 *
 * "Add to my calendar" is the single most useful thing on the booking page and
 * the one a text cannot do. Every phone and every desktop client opens an .ics
 * without being told how, so this needs no app, no account and no explaining.
 *
 * A file rather than a subscription, deliberately. The diary already publishes
 * a feed for the people who work here, and that is the right shape for somebody
 * whose whole week is in it. A customer has one appointment and wants it in
 * their own calendar next to everything else in their life — a feed they would
 * have to remove later is a worse answer than a single entry they own.
 *
 * Same token as the page, so anybody who can read the details can save them,
 * and nobody else can do either.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const db = createAdminClient();

  const { data: booking } = await db
    .from("bookings")
    .select("*, artists(name, studio_id)")
    .eq("public_token", token)
    .maybeSingle();

  const artist = booking?.artists as unknown as { name: string; studio_id: string } | null;
  if (!booking || !artist) return new Response("Not found", { status: 404 });

  const { data: studio } = await db
    .from("studios")
    .select("name")
    .eq("id", artist.studio_id)
    .maybeSingle();

  if (!studio) return new Response("Not found", { status: 404 });

  const title = (booking.title as string | null) ?? "Appointment";

  const ics = buildCalendar({
    name: studio.name as string,
    events: [
      {
        /*
         * Stable, so saving it twice updates the entry rather than making a
         * second one. The token is already unique per booking and is what the
         * customer's calendar will have seen the first time.
         */
        uid: `booking-${token}@second-pair.com`,
        starts: new Date(booking.starts_at as string),
        ends: new Date(booking.ends_at as string),
        summary: `${title} — ${studio.name as string}`,
        description: `With ${artist.name}.`,
        updated: new Date((booking.updated_at as string) ?? (booking.created_at as string)),
        /*
         * A cancelled appointment still answers, and says it is cancelled.
         * Somebody who saved it needs the entry to disappear from their
         * calendar, and the only way to tell them that is to send the same
         * uid back marked cancelled.
         */
        cancelled: Boolean(booking.cancelled_at),
      },
    ],
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointment.ics"`,
      /* One person's appointment: never cached by anything in between. */
      "Cache-Control": "private, no-store",
    },
  });
}
