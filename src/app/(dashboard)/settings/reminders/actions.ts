"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, requireOwner } from "@/lib/studio";
import { hasColumn } from "@/lib/db/hasColumn";
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

  /*
   * "As soon as they book" is zero hours before.
   *
   * The form asks in words and the column stores the number, so nothing below
   * this line has to know there is such a thing as a confirmation. The hours
   * field is still submitted when the confirmation is chosen — it is hidden
   * rather than unmounted — and is deliberately ignored here rather than
   * validated, because whatever is sitting in it is not what was asked for.
   */
  const confirmation = str(fd, "when") === "book";

  const hours = confirmation ? 0 : Number(str(fd, "hours_before"));
  if (!confirmation && (!Number.isFinite(hours) || hours < 1 || hours > 720)) {
    return { error: "Send it between 1 hour and 30 days before." };
  }

  const row = {
    studio_id: studio.id,
    artist_id: artistId,
    label: str(fd, "label") || (confirmation ? "Booking confirmation" : `${hours} hours before`),
    hours_before: hours,
    body,
    enabled: ticked(fd, "enabled"),
    sort_order: Number(str(fd, "sort_order")) || 0,
    /*
     * Only where the column exists, and "both" only where it was sold —
     * checked here as well as on the screen, because a form can be posted.
     */
    ...((await hasColumn(supabase, "reminder_templates", "channels"))
      ? { channels: await allowedChannel(supabase, studio.id, str(fd, "channels")) }
      : {}),
  };

  const id = str(fd, "id");
  /*
   * Asked for the row back, so "nothing matched" is not read as success.
   *
   * A member of staff editing one of the business's reminders (or an id from a
   * stale page) is refused by the database rules, which changes nothing and
   * reports no error — so the screen said saved and the reminder went out
   * unchanged the next evening.
   */
  const { data: written, error } = id
    ? await supabase.from("reminder_templates").update(row).eq("id", id).select("id")
    : await supabase.from("reminder_templates").insert(row).select("id");

  if (!error && !written?.length) {
    return {
      error: artistId
        ? "That reminder is not yours to change."
        : "Only the owner can change the business's reminders.",
    };
  }

  if (error) {
    if (error.code === "23505") {
      return {
        error: confirmation
          ? "You already have a confirmation. Change that one rather than adding a second."
          : "There is already a reminder at that many hours before.",
      };
    }

    /*
     * The check constraint, which means the migration has not been run.
     *
     * Deploys go out before migrations here, so there is a window where this
     * screen offers confirmations and the database still refuses a zero. The
     * raw message for that is "violates check constraint
     * reminder_templates_hours_before_check", which tells an owner nothing and
     * looks like their fault.
     */
    if (error.code === "23514" && confirmation) {
      return {
        error: "Confirmations are not switched on for your account yet. Tell us and we will do it.",
      };
    }

    return { error: error.message };
  }

  revalidatePath(where);
  return { ok: true };
}

/**
 * How this business wants messages sent.
 *
 * Its own action rather than the business page's save, for the reason that
 * one reads three dozen fields off a form and writes them all — a smaller
 * form posting to it would blank everything it did not carry.
 */
/**
 * A template's own channel, refused if it is not theirs to choose.
 *
 * The screen does not offer "both" to a business that has not been sold it,
 * and a screen is not a rule: a form can be posted with anything in it.
 */
async function allowedChannel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  asked: string,
): Promise<string> {
  if (!["default", "email", "sms", "both"].includes(asked)) return "default";
  if (asked !== "both") return asked;

  const { data } = await supabase
    .from("studios")
    .select("allow_both_channels")
    .eq("id", studioId)
    .maybeSingle();

  return data?.allow_both_channels === true ? "both" : "default";
}

export async function saveChannelChoice(_prev: FormState, fd: FormData): Promise<FormState> {
  /* requireOwner refuses anybody else, so there is no second check to forget. */
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const choice = String(fd.get("message_channels") ?? "");
  const allowed = ["as_they_came", "both", "email_first", "email_only", "sms_only"];
  if (!allowed.includes(choice)) return { error: "Pick one of the options." };

  if (!(await hasColumn(supabase, "studios", "message_channels"))) {
    return { error: "Not switched on for your account yet. Tell us and we will do it." };
  }

  const { error } = await supabase
    .from("studios")
    .update({ message_channels: choice })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/reminders");
  return { ok: true };
}
