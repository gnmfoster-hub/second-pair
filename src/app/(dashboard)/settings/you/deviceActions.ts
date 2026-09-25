"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";

export type DeviceState = { error?: string; ok?: boolean };

/**
 * Taking a device off the list.
 *
 * By row id rather than by push endpoint, which is why this exists at all
 * instead of the page calling the subscribe route's DELETE. The endpoint is
 * the address a push is sent to, and there is no reason to ship one into a
 * rendered page to give somebody a Forget button — the id is enough and means
 * nothing outside our own database.
 *
 * Scoped to the caller's own rows twice over: the studio they belong to and
 * their own user. Somebody else's phone is not theirs to remove, and the whole
 * design of notifications here is that the decision belongs to whoever is
 * holding the thing.
 *
 * The device itself is not told. It cannot be — a push subscription is a
 * one-way address — so a phone that is forgotten here simply stops receiving,
 * which is exactly what was asked for. Turning it back on is the button on
 * that device.
 */
export async function forgetDevice(_prev: DeviceState, fd: FormData): Promise<DeviceState> {
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "Nothing to forget." };

  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("id", id)
    .eq("studio_id", studio.id)
    .eq("user_id", userId);

  if (error) return { error: "Could not remove that one." };

  revalidatePath("/settings/you");
  return { ok: true };
}
