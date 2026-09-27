import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { hasColumn } from "@/lib/db/hasColumn";

/**
 * Noting that the widget loaded on a business's own website.
 *
 * The "Is it working?" page has to answer "is the assistant live on your
 * site", and it had no way to know. It counted rows in `channel_connections`,
 * and there has never been a web row for anybody — the widget is served from
 * us and needs nothing connecting — so the line could only go green once a
 * customer had used the chat. A business that had installed the code properly
 * and was waiting for its first enquiry was told the code was not installed.
 *
 * This request is the proof. The launcher asks for opening hours and colours
 * before a visitor has typed anything, every time it loads, so a hit here
 * means the code is on a page and somebody opened that page. Nothing else we
 * could measure is closer to the question being asked.
 *
 * ── Why it is throttled ─────────────────────────────────────────────────────
 *
 * Every visitor to every customer's website reaches this endpoint. Writing a
 * row per page view would be a cost with no reader: the screen says "your
 * site" or it does not, and the difference between ten seconds ago and forty
 * minutes ago is not a difference anybody acts on.
 *
 * So it writes at most once an hour per business — and reads first, because a
 * read of one indexed row is cheaper than a write, and the common case by far
 * is that it has already been seen today.
 */
const EVERY_MS = 60 * 60 * 1000;

/**
 * Which website it was seen on.
 *
 * From Origin, falling back to Referer. Both are set by the browser rather
 * than by the page, so neither can be quietly faked by a script — and the
 * point of storing it is that a slug pasted onto the wrong domain shows up
 * as the wrong domain rather than silently counting as success.
 *
 * Only the host. A full URL here would be a record of which page of somebody
 * else's website a visitor was reading, which is nothing to do with us.
 */
export function siteFrom(request: NextRequest): string | null {
  const raw = request.headers.get("origin") ?? request.headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

export async function noteWidgetSeen(
  db: SupabaseClient,
  slug: string,
  request: NextRequest,
): Promise<void> {
  try {
    /*
     * Guarded: a deploy lands before the migration is run by hand, and
     * PostgREST refuses a whole statement over one column it does not know.
     * Without this the first visitor after a deploy would make the status
     * endpoint throw — on somebody else's website, where the failure would
     * show as a chat button that never appeared.
     */
    if (!(await hasColumn(db, "studios", "widget_seen_at"))) return;

    const { data } = await db
      .from("studios")
      .select("id, widget_seen_at")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return;

    const last = data.widget_seen_at ? Date.parse(data.widget_seen_at as string) : 0;
    if (Date.now() - last < EVERY_MS) return;

    await db
      .from("studios")
      .update({
        widget_seen_at: new Date().toISOString(),
        widget_seen_on: siteFrom(request),
      })
      .eq("id", data.id);
  } catch (error) {
    /*
     * Never worth a broken launcher. This is a note about the past; the thing
     * the visitor came for is the chat button, and it is already on its way.
     */
    console.error("[widget/seen]", (error as Error)?.message);
  }
}
