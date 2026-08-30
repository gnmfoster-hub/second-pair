"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { zonedToUtc } from "@/lib/booking/tz";
import { categoryFor } from "@/lib/calendar";

export type DiaryState = { error?: string; ok?: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Turns the date and time from a form into an instant.
 *
 * The owner types wall-clock time in their own timezone. Treating it as the
 * server's would put every entry an hour out through British Summer Time — the
 * same trap the assistant's slot finder had.
 */
function instantFrom(date: string, time: string, timezone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  return zonedToUtc(+d[1], +d[2], +d[3], +t[1] * 60 + +t[2], timezone);
}

function clashMessage(code: string | undefined, fallback: string): string {
  if (code === "23P01") {
    return "That overlaps something already in the diary. Move the other one first, or pick another time.";
  }
  return fallback;
}

/**
 * One action for adding and editing, because the form is the same either way
 * and two near-identical actions drift apart.
 */
export async function saveDiaryEntry(
  _prev: DiaryState,
  fd: FormData,
): Promise<DiaryState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);

  const id = str(fd, "id");
  const artistId = str(fd, "artist_id");
  if (!artists.some((a) => a.id === artistId)) return { error: "Pick whose diary it is." };

  const allDay = str(fd, "all_day") === "true";
  const category = str(fd, "category") || "personal";
  const definition = categoryFor(category);

  const date = str(fd, "date");
  const starts = allDay
    ? instantFrom(date, "00:00", studio.timezone)
    : instantFrom(date, str(fd, "start_time"), studio.timezone);
  if (!starts) return { error: "Check the date and time." };

  let ends: Date;
  if (allDay) {
    const days = Math.min(90, Math.max(1, Number(str(fd, "days")) || 1));
    ends = new Date(starts.getTime() + days * 86400_000);
  } else {
    const minutes = Number(str(fd, "minutes"));
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) {
      return { error: "Length must be between 5 minutes and 24 hours." };
    }
    ends = new Date(starts.getTime() + minutes * 60_000);
  }

  // ---------------------------------------------------------------- editing
  if (id) {
    const { data: existing } = await supabase
      .from("bookings")
      .select("source")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return { error: "That entry has gone." };

    // A client booking's details belong to its enquiry; only its time and who
    // it is with can be changed here.
    const patch: Record<string, unknown> =
      existing.source === "assistant"
        ? {
            artist_id: artistId,
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
            notes: str(fd, "notes") || null,
          }
        : {
            artist_id: artistId,
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
            all_day: allDay,
            category,
            blocks_availability: definition.blocks,
            title: str(fd, "title") || null,
            notes: str(fd, "notes") || null,
          };

    const { error } = await supabase.from("bookings").update(patch).eq("id", id);
    if (error) return { error: clashMessage(error.code, error.message) };

    revalidatePath("/diary");
    return { ok: "Saved." };
  }

  // ---------------------------------------------------------------- adding
  const title = str(fd, "title");
  if (!title) return { error: "Give it a title." };

  const { error } = await supabase.from("bookings").insert({
    enquiry_id: null,
    artist_id: artistId,
    source: definition.blocks && category !== "meeting" ? "block" : "manual",
    type: category === "consultation" ? "consultation" : "session",
    category,
    all_day: allDay,
    blocks_availability: definition.blocks,
    title,
    notes: str(fd, "notes") || null,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    deposit_amount_pence: 0,
    // Nothing the owner adds is waiting on a deposit, so the unpaid-hold sweep
    // must never touch it.
    deposit_status: "paid",
  });

  if (error) return { error: clashMessage(error.code, error.message) };

  revalidatePath("/diary");
  return { ok: "Added." };
}

export async function cancelDiaryEntry(fd: FormData) {
  const supabase = await createClient();
  // Cancelled rather than deleted: the slot frees up, the history stays, and a
  // paid deposit remains traceable for a refund.
  await supabase
    .from("bookings")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", str(fd, "id"));

  revalidatePath("/diary");
  revalidatePath("/");
}
