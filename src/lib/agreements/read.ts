/**
 * Reading the agreements a business has, for the back office.
 *
 * Kept apart from the actions that write them so the admin page can read them
 * without importing anything that says "use server", and apart from
 * agreements/state so a client component can have the shape of an agreement and
 * the words for its state without dragging next/headers towards the browser.
 *
 * That last split was forced by a build failure rather than foreseen, and the
 * failure was right: making a link is a server's job, and knowing what an
 * agreement is is not.
 *
 * ── Why this cannot throw ───────────────────────────────────────────────────
 *
 * `agreements` arrives with a migration that is run by hand, so this code is
 * live before the table is. An unguarded read would take the whole back office
 * down with it — the one screen somebody would be on when they went looking for
 * why. So a missing table returns an empty list, exactly as a business with no
 * agreements does, and nothing on the page depends on telling those two apart.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { siteOrigin } from "@/lib/origin";
import type { AgreementRow } from "./state";

/**
 * Every agreement on the platform, newest first, grouped by business.
 *
 * All of them in one read rather than one per business: the back office draws
 * every business on one page, and a query each would be thirty round trips to
 * another continent to fill in a panel that is usually empty.
 *
 * `select("*")` because a named column PostgREST has not heard of makes it
 * refuse the whole statement — and this table's columns arrive with the table,
 * so naming them would mean this file could not ship before the migration.
 */
export async function agreementsByStudio(
  db: SupabaseClient,
): Promise<Map<string, AgreementRow[]>> {
  const out = new Map<string, AgreementRow[]>();

  try {
    const { data, error } = await db
      .from("agreements")
      .select("*")
      .order("created_at", { ascending: false });

    /* A missing table is not a fault to report here. See the note above. */
    if (error || !data) return out;

    const origin = siteOrigin();

    for (const r of data) {
      const row: AgreementRow = {
        id: r.id as string,
        studioId: r.studio_id as string,
        setupFeePence: Number(r.setup_fee_pence ?? 0),
        recurringPence: Number(r.recurring_pence ?? 0),
        period: String(r.period ?? "monthly"),
        trialEndsOn: (r.trial_ends_on as string | null) ?? null,
        includes: Array.isArray(r.includes) ? (r.includes as string[]) : [],
        noticeDays: Number(r.notice_days ?? 60),
        noticeGivenOn: (r.notice_given_on as string | null) ?? null,
        endsOn: (r.ends_on as string | null) ?? null,
        termsVersion: String(r.terms_version ?? ""),
        sentTo: (r.sent_to as string | null) ?? null,
        sentAt: (r.sent_at as string | null) ?? null,
        openedAt: (r.opened_at as string | null) ?? null,
        signedAt: (r.signed_at as string | null) ?? null,
        signerName: (r.signer_name as string | null) ?? null,
        voidAt: (r.void_at as string | null) ?? null,
        link: r.token ? `${origin}/a/${r.token as string}` : null,
      };
      const list = out.get(row.studioId);
      if (list) list.push(row);
      else out.set(row.studioId, [row]);
    }
  } catch {
    /* Same answer as a refused read: nothing to show. */
  }

  return out;
}
