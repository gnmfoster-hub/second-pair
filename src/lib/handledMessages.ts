import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How long a message id is worth remembering.
 *
 * It exists to stop a webhook retry being answered twice, and Meta gives up
 * retrying long before this. Three days is generous rather than considered:
 * the cost of keeping one is a row, and the cost of dropping one too early is
 * a customer answered twice.
 */
export const KEEP_DAYS = 3;

/** The moment before which a remembered id has no further use. */
export function cutoff(now: Date, days = KEEP_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Clearing out ids nothing will ever ask about again.
 *
 * The table was written with a comment saying the sweep clears it. Nothing
 * did. Left alone it grows by a row per message forever — slowly, invisibly,
 * and only becoming a problem long after anybody remembers why the table is
 * there.
 *
 * Errors come back rather than thrown: this runs beside reminders going out,
 * and tidying failing must never stop those.
 */
export async function forgetHandledMessages(
  db: SupabaseClient,
  now = new Date(),
): Promise<{ removed: number; error?: string }> {
  const { data, error } = await db
    .from("handled_messages")
    .delete()
    .lt("seen_at", cutoff(now).toISOString())
    .select("message_id");

  if (error) return { removed: 0, error: error.message };
  return { removed: data?.length ?? 0 };
}
