"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { parsePounds } from "@/lib/money";

export type MyServiceState = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Something only this person does.
 *
 * A nail technician working inside a salon has her own list — gels, wraps,
 * removals, twenty colours — and none of it belongs on the salon's price list,
 * because no stylist there does any of it. The same is true of a piercer in a
 * tattoo studio and the person in a garage who does the MOTs.
 *
 * Theirs, so which person it belongs to is read off the session and never
 * taken from the form. A form field would let somebody add an item to a
 * colleague's list — or move one of theirs onto the shop's, where everybody
 * would start being offered it.
 *
 * The row-level policy checks the same thing again from the other side, so
 * this is the readable error rather than the only guard.
 */
export async function saveMyService(
  _prev: MyServiceState,
  fd: FormData,
): Promise<MyServiceState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const { data: me } = await supabase
    .from("artists")
    .select("id, owner_managed")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!me) return { error: "Your sign-in is not linked to anybody in the diary." };
  /*
   * A person the business looks after does not set this.
   *
   * The row-level policy refuses the write too, for the three tables that have
   * one — this is the sentence somebody can read instead of a policy error,
   * and the only guard at all for the two that write to their own artist row.
   */
  if (me.owner_managed === true) {
    return {
      error:
        "The business sets this. Ask whoever runs it and they can change it in a minute.",
    };
  }


  const name = str(fd, "name");
  if (!name) return { error: "Give it a name." };

  const kind = str(fd, "kind") === "product" ? "product" : "service";
  const raw = str(fd, "minutes");
  const n = Number(raw);
  const minutes = kind === "product" ? null : Number.isFinite(n) && n > 0 ? Math.round(n) : null;

  /*
   * A service with no length cannot be booked: the diary would not know how
   * big a block to draw and the assistant would not know what to offer. The
   * database would take it, so it is refused here where somebody can read why.
   */
  if (kind === "service" && minutes === null) {
    return { error: "How many minutes does it take? Without a length it cannot be booked." };
  }

  const from = parsePounds(fd.get("price"));
  const to = parsePounds(fd.get("price_to"));

  if (to !== null && from !== null && to < from) {
    return { error: "The top of the range is less than the bottom." };
  }

  const id = str(fd, "id");
  const row = {
    studio_id: studio.id,
    artist_id: me.id,
    name,
    kind,
    minutes,
    price_pence: from,
    price_to_pence: to,
    bookable_online: fd.get("bookable_online") !== "off",
    sort_order: Number(str(fd, "sort_order")) || 0,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("services").update(row).eq("id", id).eq("artist_id", me.id)
    : await supabase.from("services").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/settings/you");
  revalidatePath("/settings/pricing");
  return { ok: true };
}

/**
 * Taking one of their own off the list.
 *
 * Marked inactive rather than deleted, for the same reason the business's are:
 * bookings and takings point at it, and removing the row would take the name
 * off last month's appointments and leave a report that cannot say what was
 * sold.
 */
export async function retireMyService(
  _prev: MyServiceState,
  fd: FormData,
): Promise<MyServiceState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const { data: me } = await supabase
    .from("artists")
    .select("id, owner_managed")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!me) return { error: "Your sign-in is not linked to anybody in the diary." };
  /*
   * A person the business looks after does not set this.
   *
   * The row-level policy refuses the write too, for the three tables that have
   * one — this is the sentence somebody can read instead of a policy error,
   * and the only guard at all for the two that write to their own artist row.
   */
  if (me.owner_managed === true) {
    return {
      error:
        "The business sets this. Ask whoever runs it and they can change it in a minute.",
    };
  }


  const id = str(fd, "id");
  if (!id) return { error: "Nothing to remove." };

  const { error } = await supabase
    .from("services")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("artist_id", me.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/you");
  revalidatePath("/settings/pricing");
  return { ok: true };
}
