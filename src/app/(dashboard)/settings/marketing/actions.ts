"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/studio";
import { ticked } from "@/lib/forms";
import { businessMay, type MarketingBusiness } from "@/lib/marketingPlan";
import type { FormState } from "../actions";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Writing a campaign.
 *
 * The owner's, like everything else that decides what leaves the building in
 * the business's name.
 *
 * The check that matters is the channel: a business can only save a campaign
 * on a channel we have switched on for them. Without it somebody could write
 * a text campaign they have not bought, switch it on, and find out from an
 * invoice — and texts are the expensive half, which is the whole reason the
 * two are sold separately.
 */
export async function saveCampaign(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const id = str(fd, "id");

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", id)
      .eq("studio_id", studio.id);
    if (error) return { error: error.message };
    revalidatePath("/settings/marketing");
    return { ok: true };
  }

  const name = str(fd, "name");
  const body = str(fd, "body");
  const channel = str(fd, "channel") === "sms" ? "sms" : "email";

  if (!name) return { error: "Give it a name, so you know which one it is." };
  if (!body) return { error: "Write what it should say." };

  if (!businessMay(studio as unknown as MarketingBusiness, channel)) {
    return {
      error:
        channel === "sms"
          ? "Text marketing is not switched on for your account. Ask us and we will sort it."
          : "Email marketing is not switched on for your account. Ask us and we will sort it.",
    };
  }

  const days = Number(str(fd, "after_days"));
  if (!Number.isFinite(days) || days < 1 || days > 730) {
    return { error: "Send it between a day and two years after the appointment." };
  }

  const row = {
    studio_id: studio.id,
    name,
    body,
    channel,
    /* Blank means any appointment, which is stored as null rather than "". */
    after_service: str(fd, "after_service") || null,
    after_days: days,
    enabled: ticked(fd, "enabled"),
    updated_at: new Date().toISOString(),
  };

  /*
   * Asked for the row back, so "nothing matched" is not read as success — the
   * same reason the reminder editor does it. A stale id changes nothing and
   * reports no error, and the screen would say saved.
   */
  const { data: written, error } = id
    ? await supabase.from("campaigns").update(row).eq("id", id).eq("studio_id", studio.id).select("id")
    : await supabase.from("campaigns").insert(row).select("id");

  if (error) {
    return {
      error: /relation .*campaigns.* does not exist/i.test(error.message)
        ? "Campaigns are not switched on for your account yet. Tell us and we will do it."
        : error.message,
    };
  }

  if (!written?.length) return { error: "That campaign is not yours to change." };

  revalidatePath("/settings/marketing");
  return { ok: true };
}
