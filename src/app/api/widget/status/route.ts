import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { statusFor } from "@/lib/widgetStatus";
import type { OpeningHours } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the launcher on a customer's website says about itself.
 *
 * Two fields and nothing else. This is fetched by a script running on somebody
 * else's site, by a visitor who has not asked us anything yet, so it says only
 * what a passer-by could work out from the front door: whether the business is
 * open, and one line about it.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("studio")?.trim();
  if (!slug) return NextResponse.json({ error: "Missing studio" }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("studios")
    .select("hours, timezone")
    .eq("slug", slug)
    .maybeSingle();

  /*
   * A business we cannot read is not a closed one.
   *
   * Anything other than a confident yes falls back to the neutral line, so a
   * database blip on somebody's website reads as an ordinary chat button
   * rather than as "this business is shut".
   */
  if (error || !data) {
    return NextResponse.json({ open: false, line: "Ask us anything" });
  }

  const status = statusFor(
    (data.hours ?? []) as OpeningHours[],
    (data.timezone as string) || "Europe/London",
    new Date(),
  );

  return NextResponse.json(status, {
    // A minute is long enough to spare the database on a busy site and short
    // enough that "Answering now" turns over close to when it actually does.
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
