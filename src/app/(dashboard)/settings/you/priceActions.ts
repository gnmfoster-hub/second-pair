"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { parsePounds } from "@/lib/money";

export type PriceState = { error?: string; ok?: boolean; saved?: number };

/**
 * What this person charges, and how long they take, where it differs.
 *
 * Saved in one go rather than a row at a time. Somebody sitting down to do
 * this is doing all of it — they are answering "what do I charge" across a
 * price list, not correcting one number — and a screen that makes them press
 * Save nine times is a screen where the ninth never gets pressed.
 *
 * Theirs, not the owner's. A stylist already sets her own hourly rate and her
 * own minimum on this same page; what she charges for a blow dry is the same
 * kind of fact. The database agrees: service_people has a policy for the
 * owner and a separate one for the person the row names.
 */
export async function saveMyPrices(_prev: PriceState, fd: FormData): Promise<PriceState> {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  /*
   * Which person is signed in, read here rather than taken from the form.
   *
   * A form field would let somebody set another person's prices by editing
   * the page, and the row would be written with their own credentials so
   * nothing else would stop it. The row belongs to whoever is signed in, so
   * that is the only place the id can honestly come from.
   */
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


  /*
   * Only the services actually on this business's list. The form says which
   * ones it drew, and a service id that is not one of them is either a stale
   * page or somebody having a go; either way it is dropped rather than
   * written, so a row can never point at another business's price list.
   */
  const { data: services } = await supabase
    .from("services")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("active", true);

  const known = new Set((services ?? []).map((s) => s.id));

  const upserts: {
    service_id: string;
    artist_id: string;
    minutes: number | null;
    price_pence: number | null;
  }[] = [];
  const clears: string[] = [];

  for (const id of known) {
    const price = parsePounds(fd.get(`price_${id}`));
    const rawMinutes = String(fd.get(`minutes_${id}`) ?? "").trim();
    const n = Number(rawMinutes);
    const minutes = rawMinutes !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;

    /*
     * Both boxes empty means "whatever the list says", which is the answer for
     * nearly every service and has to cost nothing to give. It is expressed by
     * there being no row at all, so emptying the boxes deletes one — otherwise
     * a person who changed their mind would be stuck with an override they
     * could see no way to remove.
     */
    if (price === null && minutes === null) {
      clears.push(id);
    } else {
      upserts.push({ service_id: id, artist_id: me.id, minutes, price_pence: price });
    }
  }

  if (clears.length) {
    const { error } = await supabase
      .from("service_people")
      .delete()
      .eq("artist_id", me.id)
      .in("service_id", clears);
    if (error) return { error: error.message };
  }

  if (upserts.length) {
    const { error } = await supabase
      .from("service_people")
      .upsert(upserts, { onConflict: "service_id,artist_id" });
    if (error) return { error: error.message };
  }

  revalidatePath("/settings/you");
  revalidatePath("/settings/pricing");
  return { ok: true, saved: upserts.length };
}
