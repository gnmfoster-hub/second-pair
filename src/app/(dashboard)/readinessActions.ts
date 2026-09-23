"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/studio";
import { hasColumn } from "@/lib/db/hasColumn";

/**
 * "That one is fine as it is."
 *
 * Giles, on the consultation warning: if I do not want to adjust the time
 * there should be a way of getting rid of it. A warning with no way to answer
 * it gets ignored along with everything beside it, which is how a genuinely
 * broken thing ends up unread in a list somebody has decided to live with.
 *
 * The owner's, not any member of staff's: it changes what everybody who runs
 * the business sees on the inbox.
 */
/*
 * Returns nothing, because a <form action> must.
 *
 * There is no inline place to show an error here and no need for one: if this
 * fails the row simply stays where it was, which is the same thing the screen
 * would have said. Anything that goes wrong is logged rather than swallowed.
 */
export async function dismissCheck(fd: FormData): Promise<void> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const key = String(fd.get("key") ?? "").trim();
  if (!key) return;

  if (!(await hasColumn(supabase, "studios", "readiness_dismissed"))) {
    console.error("[readiness] readiness_dismissed is not in the database yet");
    return;
  }

  /*
   * Read, add, write. Not a raw array append, because two people pressing at
   * once on different checks should end with both put away rather than
   * whichever wrote last.
   *
   * Blocking checks are refused by readinessOf rather than here — it is the
   * one place that knows which are blocking, and putting the rule anywhere
   * else means two answers to the same question.
   */
  const { data: current } = await supabase
    .from("studios")
    .select("readiness_dismissed")
    .eq("id", studio.id)
    .maybeSingle();

  const now = new Set<string>((current?.readiness_dismissed as string[] | null) ?? []);
  now.add(key);

  const { error } = await supabase
    .from("studios")
    .update({ readiness_dismissed: [...now] })
    .eq("id", studio.id);

  if (error) {
    console.error("[readiness] could not put that one away:", error.message);
    return;
  }

  revalidatePath("/");
  revalidatePath("/setup");
}

/** Put them all back, for somebody who wants the full list again. */
export async function restoreChecks(): Promise<{ ok?: true; error?: string }> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  if (!(await hasColumn(supabase, "studios", "readiness_dismissed"))) {
    return { error: "Not switched on for your account yet." };
  }

  const { error } = await supabase
    .from("studios")
    .update({ readiness_dismissed: [] })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/setup");
  return { ok: true };
}
