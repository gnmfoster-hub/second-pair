import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueReminders } from "@/lib/reminders";
import { releaseExpiredHolds } from "@/lib/booking";
import type { Studio } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The scheduled job: send what is due, release slots nobody paid for.
 *
 * Protected by a shared secret rather than a session, because it is called by a
 * scheduler and not a person. Without the secret set it refuses outright — an
 * open endpoint that sends messages to a studio's clients is not something to
 * leave lying around.
 *
 * On Vercel this is wired to a cron entry; anything that can make an HTTPS
 * request on a timer works just as well.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("key");

  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const db = createAdminClient();

  // Frees slots held for a deposit that never arrived. Also done lazily when
  // availability is read, so this is a backstop for quiet diaries.
  const released = await releaseExpiredHolds(db);

  const { data: studios } = await db.from("studios").select("*");

  let due = 0;
  let sent = 0;
  let waiting = 0;
  const failures: string[] = [];

  for (const studio of (studios ?? []) as Studio[]) {
    try {
      const result = await sendDueReminders(db, studio);
      due += result.due;
      sent += result.sent;
      waiting += result.waiting.length;
      if (result.failed) failures.push(`${studio.name}: ${result.failed} failed`);
    } catch (error) {
      failures.push(`${studio.name}: ${(error as Error).message}`);
    }
  }

  return NextResponse.json({ released, due, sent, waiting, failures });
}
