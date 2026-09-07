import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { statusFor } from "@/lib/widgetStatus";
import { paint } from "@/lib/widget/colour";
import {
  geometry,
  bubbleColours,
  lineFor,
  isShape,
  isSize,
  isBubble,
  isPulse,
  pulsePlan,
} from "@/lib/widget/look";
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
 *
 * Which is why every answer here says any origin may read it. It went out
 * without that and the browser refused the reply on every site but our own —
 * so on the one page it exists for, the business's own, the launcher fell back
 * to a plain circle, the opening line never appeared and the accent colour
 * never applied. Nothing errored: the widget is built to shrug this off, and
 * it shrugged silently. It only showed up by putting the script on somebody
 * else's domain and looking at it.
 */
/**
 * Every answer from here, with the header that lets the page it is for read it.
 *
 * One function rather than a header remembered on each of four returns,
 * because it was forgotten on all four and the widget lost its face on every
 * site but ours. A fifth branch added later would have forgotten it too.
 */
function readableAnywhere(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...init.headers, "Access-Control-Allow-Origin": "*" },
  });
}
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("studio")?.trim();
  if (!slug) return readableAnywhere({ error: "Missing studio" }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("studios")
    .select(
      "hours, timezone, archived_at, widget_accent, widget_text, widget_position, widget_teaser, widget_enabled, widget_line_open, widget_line_closed, widget_shape, widget_size, widget_bubble, widget_pulse",
    )
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
    return readableAnywhere({ open: false, line: "Ask us anything" });
  }

  /*
   * A stopped business says nothing rather than "answering now".
   *
   * The launcher would otherwise keep promising an assistant that has been
   * switched off, which is the one claim on the button that has to be true.
   */
  if (data.archived_at) {
    return readableAnywhere({
      open: false,
      line: "Ask us anything",
      accent: null,
      text: null,
      position: "right",
      teaser: null,
    });
  }

  /*
   * Both colours, worked out once, here.
   *
   * These are interpolated into styles on somebody else's page, so `paint`
   * reads them strictly and falls back rather than passing anything along that
   * is not plainly six hex digits.
   *
   * Sent already decided, rather than as a colour plus a rule for the script
   * to apply: the settings page shows a preview of this, and a preview that
   * runs a second copy of the rule is a preview that can disagree with the
   * site it is previewing.
   */
  const look = paint(
    typeof data.widget_accent === "string" ? data.widget_accent : null,
    typeof data.widget_text === "string" ? data.widget_text : null,
  );

  /*
   * Switched off is answered first, and answered with almost nothing.
   *
   * The script asks for this before it draws anything, so "off" has to arrive
   * before there is a button to hide. Sending the colours and the line as well
   * would be sending a description of a thing that is not going to exist.
   */
  if (data.widget_enabled === false) {
    return readableAnywhere({ off: true });
  }

  const status = statusFor(
    (data.hours ?? []) as OpeningHours[],
    (data.timezone as string) || "Europe/London",
    new Date(),
  );

  const size = isSize(data.widget_size) ? data.widget_size : "medium";
  const shape = isShape(data.widget_shape) ? data.widget_shape : "round";
  const bubble = isBubble(data.widget_bubble) ? data.widget_bubble : "light";

  return readableAnywhere({
    ...status,
    line: lineFor(status.line, status.open, {
      open: typeof data.widget_line_open === "string" ? data.widget_line_open : null,
      closed: typeof data.widget_line_closed === "string" ? data.widget_line_closed : null,
    }),
    accent: look.fill,
    text: look.text,
    geometry: geometry(size, shape),
    bubble: bubbleColours(bubble),
    pulse: pulsePlan(isPulse(data.widget_pulse) ? data.widget_pulse : "once"),
    position: data.widget_position === "left" ? "left" : "right",
    teaser: typeof data.widget_teaser === "string" && data.widget_teaser.trim()
      ? data.widget_teaser.trim().slice(0, 140)
      : null,
  }, {
    /*
     * Not cached, deliberately.
     *
     * This was a minute, to spare the database on a busy site. The cost of
     * that minute is a business changing their colour, reloading their own
     * page, seeing the old one, and concluding the product does not work —
     * which is exactly what happened. They are not going to wait and try
     * again; they are going to change it back and ring somebody.
     *
     * It is one indexed row and about two hundred bytes, fetched once per page
     * view alongside the page itself. The saving was never worth what it cost.
     */
    headers: { "Cache-Control": "no-store" },
  });
}
