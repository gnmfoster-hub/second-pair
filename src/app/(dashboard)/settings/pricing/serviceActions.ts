"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { parsePounds } from "@/lib/money";

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
