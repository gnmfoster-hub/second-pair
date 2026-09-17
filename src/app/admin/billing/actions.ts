"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { meterThisMonth } from "@/lib/meter";

/**
 * Second Pair's own books. Every one of these checks the same thing first:
 * that the person asking is us. A business must never reach any of it.
 */
async function ours() {
  if (!(await isPlatformAdmin())) throw new Error("Not yours to change.");
  return createAdminClient();
}

function pence(raw: FormDataEntryValue | null): number {
  const pounds = Number(String(raw ?? "").replace(/[£,\s]/g, ""));
  return Number.isFinite(pounds) ? Math.round(pounds * 100) : 0;
}

/** What a business is on: the monthly price, what it includes, the overage. */
export async function setPlan(fd: FormData): Promise<void> {
  const db = await ours();
  const id = String(fd.get("studio") ?? "");
  if (!id) return;

  const includedRaw = String(fd.get("texts_included") ?? "").trim();

  const { error } = await db
    .from("studios")
    .update({
      plan: String(fd.get("plan") ?? "").trim() || null,
      plan_pence: pence(fd.get("plan_price")),
      // Empty means unlimited, which is a real answer and not a missing one.
      texts_included: includedRaw === "" ? null : Math.max(0, Math.round(Number(includedRaw) || 0)),
      text_overage_pence: Math.max(0, Math.round(Number(fd.get("overage") ?? 0) || 0)),
    })
    .eq("id", id);

  /*
   * Said out loud, because these forms have nowhere to say it quietly.
   *
   * Every write on this page threw its answer away. Pressing Save on a plan
   * that failed — a constraint, a policy, a typo in a column — revalidated the
   * page, redrew the old figure, and looked exactly like a save that worked
   * and had nothing to change. This is the screen the prices are set on and
   * the suppliers' bills are typed into; a number silently not saved here is a
   * business invoiced wrongly, or a cost that never reaches the margin.
   *
   * An error page is ugly. It is also the truth, and this screen has one user.
   */
  if (error) throw new Error(`Could not save the plan: ${error.message}`);

  revalidatePath("/admin/billing");
}

/**
 * Marking a month as billed.
 *
 * The figure is written down rather than recalculated later: what somebody was
 * actually charged is a fact about the past, and a plan that changes next
 * month must not quietly rewrite it.
 */
export async function markBilled(fd: FormData): Promise<void> {
  const db = await ours();
  const studio = String(fd.get("studio") ?? "");
  const month = String(fd.get("month") ?? "");
  if (!studio || !month) return;

  const { error } = await db
    .from("usage_months")
    .update({
      billed_pence: pence(fd.get("amount")),
      billed_at: new Date().toISOString(),
      note: String(fd.get("note") ?? "").trim() || null,
    })
    .eq("studio_id", studio)
    .eq("month", month);

  if (error) throw new Error(`Could not mark that month as billed: ${error.message}`);

  revalidatePath("/admin/billing");
}

/** An invoice that has arrived: Vercel, Supabase, Twilio, Anthropic, the domain. */
export async function recordCost(fd: FormData): Promise<void> {
  const db = await ours();
  const supplier = String(fd.get("supplier") ?? "").trim();
  const month = String(fd.get("month") ?? "").trim();
  if (!supplier || !/^\d{4}-\d{2}-01$/.test(month)) return;

  const { error } = await db.from("platform_costs").insert({
    month,
    supplier,
    pence: pence(fd.get("amount")),
    note: String(fd.get("note") ?? "").trim() || null,
  });

  if (error) throw new Error(`Could not record that bill: ${error.message}`);

  revalidatePath("/admin/billing");
}

export async function removeCost(fd: FormData): Promise<void> {
  const db = await ours();
  const id = String(fd.get("id") ?? "");
  if (id) {
    const { error } = await db.from("platform_costs").delete().eq("id", id);
    if (error) throw new Error(`Could not remove that bill: ${error.message}`);
  }
  revalidatePath("/admin/billing");
}

/**
 * Count it again now, rather than waiting for tonight.
 *
 * The nightly job does this on its own; this is for the moment you are looking
 * at the screen and want today's messages in the figure.
 */
export async function remeter(): Promise<void> {
  const db = await ours();
  await meterThisMonth(db);
  revalidatePath("/admin/billing");
}
