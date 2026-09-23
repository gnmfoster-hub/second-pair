"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/studio";
import { ticked } from "@/lib/forms";
import { hasColumn } from "@/lib/db/hasColumn";
import type { FormState } from "../actions";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Just the two review fields, and nothing else.
 *
 * Deliberately its own action rather than reusing the business page's save.
 * That one reads three dozen fields off the form and writes them all, so a
 * smaller form posting to it would blank everything it did not carry — the
 * opening hours, the cancellation policy, the VAT number. A narrow action
 * cannot do that to anybody.
 */
export async function saveReviews(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  if (!(await hasColumn(supabase, "studios", "review_url"))) {
    return { error: "Review requests are not switched on for your account yet. Tell us and we will do it." };
  }

  const url = str(fd, "review_url");

  if (url && !/^https?:\/\//i.test(url)) {
    return { error: "That link needs to start with http:// or https://." };
  }

  /*
   * On only when there is somewhere to send them.
   *
   * A switch that is on with no link sends a message with a hole in it, so
   * the two are decided together rather than separately — the same rule the
   * business page had, kept when it moved.
   */
  /*
   * Their wording, only when the form carries it.
   *
   * Absent means an older page saving what it shows; present and empty means
   * they cleared it on purpose, which is a different thing from never having
   * written one and is stored as such. See the migration.
   */
  const wording = fd.has("review_message")
    ? { review_message: String(fd.get("review_message") ?? "") }
    : {};

  const { error } = await supabase
    .from("studios")
    .update({
      review_url: url || null,
      review_ask: ticked(fd, "review_ask") && Boolean(url),
      ...((await hasColumn(supabase, "studios", "review_message")) ? wording : {}),
    })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/reviews");
  return { ok: true };
}
