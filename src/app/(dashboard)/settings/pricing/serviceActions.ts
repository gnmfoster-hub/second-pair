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
  }[] = [];
  const clears: string[] = [];

  for (const { id } of services ?? []) {
    const price = parsePounds(fd.get(`price_${id}`));
    const raw = String(fd.get(`minutes_${id}`) ?? "").trim();
    const n = Number(raw);
    const minutes = raw !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;

    // Both empty means the shop's price, which is expressed by no row at all.
    if (price === null && minutes === null) clears.push(id);
    else upserts.push({ service_id: id, artist_id: artistId, minutes, price_pence: price });
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
