"use server";

import { revalidatePath } from "next/cache";
import { requireStudio, requireOwner } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { parsePounds } from "@/lib/money";
import { hasColumn } from "@/lib/db/hasColumn";

export type ServiceState = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * A number of minutes, or null.
 *
 * Blank is a real answer for a product and a mistake for a service, which is
 * why the caller decides rather than this.
 */
function minutesOf(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Adding or changing something on the price list.
 *
 * The list belongs to the business, so this is the owner's. What each person
 * charges for a thing on it is theirs, and lives elsewhere.
 */
export async function saveService(_prev: ServiceState, fd: FormData): Promise<ServiceState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Give it a name." };

  const kind = str(fd, "kind") === "product" ? "product" : "service";
  const minutes = kind === "product" ? null : minutesOf(str(fd, "minutes"));

  /*
   * A service with no length cannot be booked: the diary would not know how
   * big a block to draw and the assistant would not know what to offer. The
   * database would take it, so it is refused here where somebody can read why.
   */
  if (kind === "service" && minutes === null) {
    return { error: "How many minutes does it take? A service without a length cannot be booked." };
  }

  const from = parsePounds(fd.get("price"));
  const to = parsePounds(fd.get("price_to"));

  if (to !== null && from !== null && to < from) {
    return { error: "The top of the range is less than the bottom." };
  }

  /*
   * How many are left, once the column exists.
   *
   * Guarded, because PostgREST rejects an entire statement over one column it
   * has not heard of — so without this a deploy landing before its migration
   * would stop anybody saving a price at all, and a shop that cannot edit its
   * price list is a far worse morning than one that cannot count bottles.
   *
   * Blank is "not counting" rather than nought. Nought says the shelf is bare.
   */
  const counts: { stock?: number | null } = (await hasColumn(supabase, "services", "stock"))
    ? {
        stock: (() => {
          const raw = str(fd, "stock");
          if (!raw) return null;
          const n = Number(raw);
          return Number.isInteger(n) && n >= 0 ? n : null;
        })(),
      }
    : {};

  /*
   * The form it needs first, when forms exist and the form field was on the
   * page. Checked against this business's own forms rather than trusted.
   */
  const formFirst: { requires_form_id?: string | null } = {};
  if (fd.has("requires_form_id") && (await hasColumn(supabase, "services", "requires_form_id"))) {
    const chosen = str(fd, "requires_form_id");
    if (!chosen) formFirst.requires_form_id = null;
    else {
      const { data: form } = await supabase
        .from("form_templates")
        .select("id")
        .eq("id", chosen)
        .eq("studio_id", studio.id)
        .maybeSingle();
      formFirst.requires_form_id = form ? chosen : null;
    }
  }

  const row = {
    studio_id: studio.id,
    name,
    kind,
    minutes,
    price_pence: from,
    price_to_pence: to,
    requires_consultation: fd.get("requires_consultation") === "on",
    bookable_online: fd.get("bookable_online") !== "off",
    sort_order: Number(str(fd, "sort_order")) || 0,
    updated_at: new Date().toISOString(),
    ...counts,
    ...formFirst,
  };

  const { error } = id
    ? await supabase.from("services").update(row).eq("id", id).eq("studio_id", studio.id)
    : await supabase.from("services").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/settings/pricing");
  return { ok: true };
}

/**
 * Taking something off the list.
 *
 * Marked inactive rather than deleted, because bookings and takings point at
 * it: removing the row would take the name off last month's appointments and
 * leave a report that cannot say what was sold.
 */
export async function retireService(_prev: ServiceState, fd: FormData): Promise<ServiceState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = str(fd, "id");
  if (!id) return { error: "Nothing to remove." };

  const { error } = await supabase
    .from("services")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("studio_id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/pricing");
  return { ok: true };
}

/**
 * Which way this business describes what it sells.
 *
 * Switching does not move anything: the bands and the services both stay
 * where they are, and only the screen changes. So somebody can look at the
 * other one and come back without having lost a price list.
 */
export async function setPricingModel(_prev: ServiceState, fd: FormData): Promise<ServiceState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const model = str(fd, "pricing_model") === "services" ? "services" : "bands";

  const { error } = await supabase
    .from("studios")
    .update({ pricing_model: model })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/pricing");
  return { ok: true };
}

export type TeamPriceState = { error?: string; ok?: boolean };

/**
 * What one person charges, set by the owner.
 *
 * The mirror of saveMyPrices on Settings → You, and it exists for the case
 * that one cannot cover: an owner setting a salon up cannot wait for five
 * people to sign in and fill a form in, and half of a typical team has no
 * login at all. The row-level policy has allowed the owner to write these
 * since the table was created — there was simply no screen that did.
 *
 * The owner's, so requireOwner rather than requireStudio. Which person is
 * being priced does come from the form here, because that is the whole point,
 * and it is checked against this business before anything is written.
 */
export async function saveTeamPrices(
  _prev: TeamPriceState,
  fd: FormData,
): Promise<TeamPriceState> {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  const artistId = str(fd, "artist_id");
  if (!artistId) return { error: "Pick somebody first." };

  const { data: artist } = await supabase
    .from("artists")
    .select("id")
    .eq("id", artistId)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!artist) return { error: "That person is not on this business." };

  const { data: services } = await supabase
    .from("services")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("active", true);

  const upserts: {
    service_id: string;
    artist_id: string;
    minutes: number | null;
    price_pence: number | null;
    offered?: boolean;
  }[] = [];
  const clears: string[] = [];

  /*
   * Whether the form carried the "does this" ticks at all.
   *
   * The same sentinel as the person editor, and for the same reason: an
   * unticked box and an absent one are indistinguishable in a submission, so a
   * save from a screen that does not show these — or an older page in a tab —
   * would otherwise read as "they do none of it" and take somebody off the
   * whole price list.
   */
  const askedAboutOffering = await hasColumn(supabase, "service_people", "offered");
  const carriesOffering = fd.get("touch_offered") != null && askedAboutOffering;

  for (const { id } of services ?? []) {
    /*
     * Only the rows this form actually drew.
     *
     * Every active service was walked, and one that was not on the page — a
     * person's own gel nails, a product, something added in another tab — has
     * no boxes in the submission, so it read as "no price, does not do it" and
     * was saved that way. A nail tech saving her prices took her own services
     * off the assistant's list.
     */
    if (!fd.has(`price_${id}`)) continue;

    const price = parsePounds(fd.get(`price_${id}`));
    const raw = String(fd.get(`minutes_${id}`) ?? "").trim();
    const n = Number(raw);
    const minutes = raw !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;

    // Ticked means they do it, which is also what no row at all means.
    const doesIt = !carriesOffering || fd.get(`offered_${id}`) != null;

    /*
     * Nothing said and they do it: the shop's price, expressed by no row.
     *
     * "They do not do it" is a real answer and has to survive, so it keeps its
     * row even with no price and no minutes on it — otherwise ticking somebody
     * off a service would delete the only record of that fact.
     */
    if (price === null && minutes === null && doesIt) {
      clears.push(id);
      continue;
    }

    upserts.push({
      service_id: id,
      artist_id: artistId,
      minutes,
      price_pence: price,
      ...(carriesOffering ? { offered: doesIt } : {}),
    });
  }

  if (clears.length) {
    const { error } = await supabase
      .from("service_people")
      .delete()
      .eq("artist_id", artistId)
      .in("service_id", clears);
    if (error) return { error: error.message };
  }

  if (upserts.length) {
    const { error } = await supabase
      .from("service_people")
      .upsert(upserts, { onConflict: "service_id,artist_id" });
    if (error) return { error: error.message };
  }

  revalidatePath("/settings/pricing");
  revalidatePath("/settings/you");
  return { ok: true };
}
