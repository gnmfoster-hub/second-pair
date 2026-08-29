"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { parsePounds } from "@/lib/money";
import { DEFAULT_HOURS, type DepositRule, type OpeningHours, type TattooStyle } from "@/lib/types";

export type FormState = { error?: string; ok?: boolean };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function readHours(fd: FormData): OpeningHours[] {
  return DEFAULT_HOURS.map(({ day }) => ({
    day,
    open: str(fd, `hours_${day}_open`) || "10:00",
    close: str(fd, `hours_${day}_close`) || "18:00",
    closed: fd.get(`hours_${day}_closed`) === "on",
  }));
}

function readDepositRule(fd: FormData): DepositRule | { error: string } {
  if (str(fd, "deposit_type") === "percent") {
    const percent = Number(str(fd, "deposit_percent"));
    const min = parsePounds(fd.get("deposit_min"));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
      return { error: "Deposit percentage must be between 1 and 100." };
    if (min == null) return { error: "Enter a minimum deposit." };
    return { type: "percent", percent, min_pence: min };
  }
  const amount = parsePounds(fd.get("deposit_amount"));
  if (amount == null || amount === 0) return { error: "Enter a deposit amount." };
  return { type: "fixed", amount_pence: amount };
}

// ------------------------------------------------------------------ studio

export async function updateStudio(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const name = str(fd, "name");
  if (!name) return { error: "Studio name is required." };

  const deposit = readDepositRule(fd);
  if ("error" in deposit) return { error: deposit.error };

  const privacy = str(fd, "privacy_notice_url");
  if (privacy && !/^https?:\/\//i.test(privacy))
    return { error: "Privacy notice URL must start with http:// or https://" };

  const { error } = await supabase
    .from("studios")
    .update({
      name,
      tone: str(fd, "tone"),
      hours: readHours(fd),
      deposit_rule: deposit,
      cancellation_policy: str(fd, "cancellation_policy"),
      privacy_notice_url: privacy || null,
      stripe_account_id: str(fd, "stripe_account_id") || null,
      timezone: str(fd, "timezone") || "Europe/London",
    })
    .eq("id", studio.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

// ------------------------------------------------------------------ artists

export async function saveArtist(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase.from("artists").delete().eq("id", str(fd, "id"));
    // 23503: a booking still references this artist. bookings.artist_id is
    // `on delete restrict` so the diary can never be orphaned.
    if (error?.code === "23503") {
      return {
        error:
          "This artist has bookings, so they cannot be deleted. Untick “Taking bookings” " +
          "to stop new enquiries reaching them.",
      };
    }
    if (error) return { error: error.message };
    revalidatePath("/settings/artists");
    revalidatePath("/settings/pricing");
    return { ok: true };
  }

  const name = str(fd, "name");
  if (!name) return { error: "Artist name is required." };

  const hourly = parsePounds(fd.get("hourly_rate"));
  const minCharge = parsePounds(fd.get("min_charge"));
  if (hourly == null) return { error: "Enter an hourly rate." };
  if (minCharge == null) return { error: "Enter a minimum charge." };

  const row = {
    studio_id: studio.id,
    name,
    styles: fd.getAll("styles").map(String) as TattooStyle[],
    hourly_rate_pence: hourly,
    min_charge_pence: minCharge,
    day_rate_pence: parsePounds(fd.get("day_rate")),
    calendar_id: str(fd, "calendar_id") || null,
    active: fd.get("active") !== "off",
  };

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("artists").update(row).eq("id", id)
    : await supabase.from("artists").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/settings/artists");
  revalidatePath("/settings/pricing");
  return { ok: true };
}

// ------------------------------------------------------------------ price bands

export async function saveBand(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase.from("price_bands").delete().eq("id", str(fd, "id"));
    if (error) return { error: error.message };
    revalidatePath("/settings/pricing");
    return { ok: true };
  }

  const label = str(fd, "size_label");
  if (!label) return { error: "Give the band a name." };

  const low = Number(str(fd, "hours_low"));
  const high = Number(str(fd, "hours_high"));
  if (!Number.isFinite(low) || low <= 0) return { error: "Low hours must be greater than 0." };
  if (!Number.isFinite(high) || high < low)
    return { error: "High hours must be at least the low hours." };

  const row = {
    studio_id: studio.id,
    size_label: label,
    hours_low: low,
    hours_high: high,
    sort_order: Number(str(fd, "sort_order")) || 0,
    requires_consultation: fd.get("requires_consultation") === "on",
  };

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("price_bands").update(row).eq("id", id)
    : await supabase.from("price_bands").insert(row);

  if (error) {
    return {
      error: error.code === "23505" ? "A band with that name already exists." : error.message,
    };
  }

  revalidatePath("/settings/pricing");
  return { ok: true };
}

/** The sizing scale from the spec, so a new studio is not staring at an empty table. */
const STARTER_BANDS = [
  { size_label: "Coin", hours_low: 0.5, hours_high: 1, requires_consultation: false },
  { size_label: "Palm", hours_low: 1, hours_high: 2, requires_consultation: false },
  { size_label: "Hand", hours_low: 2, hours_high: 3, requires_consultation: false },
  { size_label: "Forearm", hours_low: 3, hours_high: 5, requires_consultation: false },
  { size_label: "Half sleeve", hours_low: 6, hours_high: 12, requires_consultation: true },
  { size_label: "Full sleeve", hours_low: 15, hours_high: 30, requires_consultation: true },
  { size_label: "Back piece", hours_low: 25, hours_high: 50, requires_consultation: true },
];

export async function seedStarterBands(
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { error } = await supabase.from("price_bands").insert(
    STARTER_BANDS.map((b, i) => ({ ...b, studio_id: studio.id, sort_order: i })),
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/pricing");
  return { ok: true };
}

// ------------------------------------------------------------------ faqs

export async function saveFaq(_prev: FormState, fd: FormData): Promise<FormState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { error } = await supabase.from("faqs").delete().eq("id", str(fd, "id"));
    if (error) return { error: error.message };
    revalidatePath("/settings/faqs");
    return { ok: true };
  }

  const question = str(fd, "question");
  const answer = str(fd, "answer");
  if (!question || !answer) return { error: "Both a question and an answer are required." };

  const row = {
    studio_id: studio.id,
    question,
    answer,
    sort_order: Number(str(fd, "sort_order")) || 0,
  };

  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("faqs").update(row).eq("id", id)
    : await supabase.from("faqs").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/settings/faqs");
  return { ok: true };
}
