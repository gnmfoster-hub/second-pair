"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { parsePounds } from "@/lib/money";

export type MyServiceState = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Whose list is being edited.
 *
 * Normally the signed-in person's own, read off the session and never taken
 * from the form — a form field on its own would let anybody add an item to a
 * colleague's list, or move one of theirs onto the shop's where everybody
 * starts being offered it.
 *
 * With one exception, and it is the reason this exists: the owner. Setting a
 * business up means filling in what each person does before any of them has
 * ever signed in, and until now the only screen that could do it was that
 * person's own — so an owner adding a nail technician could add her to the
 * diary and could not add a single thing she does. It was reported simply as
 * not being able to set services per team member, which is exactly what it
 * was.
 *
 * The form may name somebody, and naming somebody is only honoured for an
 * owner of this business, checked against studio_members here rather than
 * trusted from anything the browser said. So the original rule holds for
 * everybody it was written for.
 */
async function whoseList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  userId: string,
  fd: FormData,
): Promise<{ id: string } | { error: string }> {
  const asked = str(fd, "artist_id");

  if (asked) {
    const { data: role } = await supabase
      .from("studio_members")
      .select("role")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .maybeSingle();

    if (role?.role !== "owner") {
      return { error: "Only the owner can change somebody else's list." };
    }

    const { data: them } = await supabase
      .from("artists")
      .select("id")
      .eq("id", asked)
      .eq("studio_id", studioId)
      .maybeSingle();

    if (!them) return { error: "That person is not in this business." };
    return { id: them.id as string };
  }

  const { data: me } = await supabase
    .from("artists")
    .select("id, owner_managed")
    .eq("studio_id", studioId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!me) return { error: "Your sign-in is not linked to anybody in the diary." };

  /*
   * A person the business looks after does not set this themselves.
   *
   * The row-level policy refuses the write too — this is the sentence somebody
   * can read instead of a policy error. It does not apply above, because up
   * there it is the business doing the setting.
   */
  if (me.owner_managed === true) {
    return {
      error:
        "The business sets this. Ask whoever runs it and they can change it in a minute.",
    };
  }

  return { id: me.id as string };
}

/**
 * Something only this person does.
 *
 * A nail technician working inside a salon has her own list — gels, wraps,
 * removals, twenty colours — and none of it belongs on the salon's price list,
 * because no stylist there does any of it. The same is true of a piercer in a
 * tattoo studio and the person in a garage who does the MOTs.
 *
 * Whose it is comes from whoseList above, which is the session for everybody
 * except an owner setting somebody up.
 */
export async function saveMyService(
  _prev: MyServiceState,
  fd: FormData,
): Promise<MyServiceState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const whose = await whoseList(supabase, studio.id, userId, fd);
  if ("error" in whose) return whose;
  const me = whose;

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

  const whose = await whoseList(supabase, studio.id, userId, fd);
  if ("error" in whose) return whose;
  const me = whose;

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
