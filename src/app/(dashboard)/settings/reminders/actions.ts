"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { ticked } from "@/lib/forms";
import type { FormState } from "../actions";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function saveReminder(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  /*
   * Whose reminder this is.
   *
   * The form says "mine" and nothing more — which person that means is read
   * off the session, never taken from the page. A field naming the artist
   * would let somebody rewrite a colleague's reminders, which go out to that
   * colleague's clients under their name.
   */
  const mine = str(fd, "mine") === "1";
  let artistId: string | null = null;

  if (mine) {
    const { data: me } = await supabase
      .from("artists")
      .select("id, owner_managed")
      .eq("studio_id", studio.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!me) return { error: "Your sign-in is not linked to anybody in the diary." };

    // A person the business looks after does not write their own reminders.
    // The policy on the table refuses it as well; this is the readable half.
    if (me.owner_managed === true) {
      return {
        error: "The business sets the reminders. Ask whoever runs it and they can change them.",
      };
    }

    artistId = me.id;
  }

  const where = mine ? "/settings/you" : "/settings/reminders";

  if (str(fd, "intent") === "delete") {
    let q = supabase.from("reminder_templates").delete().eq("id", str(fd, "id"));
    // Scoped as well as policed, so a mistyped id cannot reach the shop's.
    if (artistId) q = q.eq("artist_id", artistId);
    const { error } = await q;
    if (error) return { error: error.message };
    revalidatePath(where);
    return { ok: true };
  }

  const body = str(fd, "body");
  if (!body) return { error: "Write what the reminder should say." };

  const hours = Number(str(fd, "hours_before"));
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
    return { error: "Send it between 1 hour and 30 days before." };
  }

  const row = {
    studio_id: studio.id,
    artist_id: artistId,
    label: str(fd, "label") || `${hours} hours before`,
    hours_before: hours,
    body,
    enabled: ticked(fd, "enabled"),
    sort_order: Number(str(fd, "sort_order")) || 0,
  };

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("reminder_templates").update(row).eq("id", id)
    : await supabase.from("reminder_templates").insert(row);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "There is already a reminder at that many hours before."
          : error.message,
    };
  }

  revalidatePath(where);
  return { ok: true };
}
