import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether a column exists yet, so a deploy can land before its migration.
 *
 * This is written down as a shared thing because I have broken the live site
 * with it twice in two days, the same way both times. PostgREST does not ignore
 * a column it does not know: it rejects the whole statement. So a write naming
 * a column whose migration has not been run yet does not lose that one field —
 * it fails the entire save. Once it was saving a client; once it was the diary,
 * for every business at the same time.
 *
 * Reads are already safe, because reading is done with select("*") for exactly
 * this reason. Writes are not, and cannot be, so they ask first.
 *
 * The rule this encodes: a new column is optional until its migration has
 * definitely run. Code checks, writes it if it is there, and saves without it
 * if it is not — which means the deploy and the migration can happen in either
 * order, on either side of a night, without anybody watching the clock.
 */

/**
 * Answers, remembered.
 *
 * A true is permanent — a column does not go away, so that is one query per
 * column for the life of the process.
 *
 * A false is not permanent, and this is the part worth being careful about.
 * Migrations are run by hand here, against a server that is already up and
 * stays up for days. Remembering "no" forever would mean the column arrives,
 * the site carries on writing without it, and nothing looks wrong — the
 * timestamps simply stay empty until something unrelated causes a redeploy.
 * That is a worse failure than the one this exists to prevent, because it is
 * silent. So a no is re-asked, rarely.
 */
const answers = new Map<string, { has: boolean; asked: number }>();

/** How long a "not yet" is trusted before asking again. */
const RETRY_AFTER_MS = 60_000;

export async function hasColumn(
  db: Pick<SupabaseClient, "from">,
  table: string,
  column: string,
  now: number = Date.now(),
): Promise<boolean> {
  const key = `${table}.${column}`;
  const seen = answers.get(key);
  if (seen && (seen.has || now - seen.asked < RETRY_AFTER_MS)) return seen.has;

  /*
   * limit(0) asks for no rows at all. The column list is still parsed and
   * checked, so this costs nothing and answers the only question being asked.
   */
  const { error } = await db.from(table).select(column).limit(0);
  const has = !error;
  answers.set(key, { has, asked: now });
  return has;
}

/** Forget everything. Tests only. */
export function forgetColumns(): void {
  answers.clear();
}
