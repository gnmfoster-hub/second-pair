import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { statusFor } from "@/lib/widgetStatus";
import type { OpeningHours } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the widget needs before anybody has said anything.
 *
 * Whether the business is open and one line about it, plus how it wants to
 * look. Fetched by a script running on somebody else's site, by a visitor who
 * has not asked us anything yet, so it carries only what a passer-by could
 * work out from the front door — the opening hours, the colour of the sign.
 *
 * The look lives here rather than on the script tag because the tag lives in
 * the HTML of the business's own website. An owner who rebrands could not
 * change their own accent colour without editing their site, which is the
 * wrong way round for something they pay us for.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("studio")?.trim();
  if (!slug) return NextResponse.json({ error: "Missing studio" }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("studios")
    .select("hours, timezone, archived_at, widget_accent, widget_position, widget_teaser")
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

  /*
   * A stopped business says nothing rather than "answering now".
   *
   * The launcher would otherwise keep promising an assistant that has been
   * switched off, which is the one claim on the button that has to be true.
   */
  if (data.archived_at) {
    return NextResponse.json({ open: false, line: "Ask us anything", accent: null, position: "right", teaser: null });
  }

  /*
   * Checked before it is handed to a script on somebody else's page.
   *
   * The accent is interpolated into a style on their site, so anything that is
   * not plainly six hex digits is dropped rather than passed along.
   */
  const accent =
    typeof data.widget_accent === "string" && /^[0-9a-f]{6}$/i.test(data.widget_accent)
      ? data.widget_accent
      : null;

  const status = statusFor(
    (data.hours ?? []) as OpeningHours[],
    (data.timezone as string) || "Europe/London",
    new Date(),
  );

  return NextResponse.json({
    ...status,
    accent,
    position: data.widget_position === "left" ? "left" : "right",
    teaser: typeof data.widget_teaser === "string" && data.widget_teaser.trim()
      ? data.widget_teaser.trim().slice(0, 140)
      : null,
  }, {
    // A minute is long enough to spare the database on a busy site and short
    // enough that "Answering now" turns over close to when it actually does.
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
