"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { zonedToUtc } from "@/lib/booking/tz";

export type DiaryState = { error?: string; ok?: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * Turns the date and time from a form into an instant.
 *
 * The owner types wall-clock time in their own timezone. Treating it as the
 * server's timezone would put every entry an hour out through British Summer
 * Time — the same trap the assistant's slot finder had.
 */
function instantFrom(date: string, time: string, timezone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  return zonedToUtc(+d[1], +d[2], +d[3], +t[1] * 60 + +t[2], timezone);
}

/** Shared by add and move: the database refuses overlaps, we explain them. */
function overlapMessage(code: string | undefined, fallback: string, isBlock = false): string {
  if (code === "23P01") {
    return isBlock
      ? "There is already an appointment in that time. Move or cancel it first, then block the time out."
      : "That clashes with something already in the diary. Pick another time.";
  }
  return fallback;
}

export async function addDiaryEntry(
  _prev: DiaryState,
  fd: FormData,
): Promise<DiaryState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);

  const artistId = str(fd, "artist_id");
  if (!artists.some((a) => a.id === artistId)) return { error: "Pick who it is for." };

  const isBlock = str(fd, "source") === "block";
  const title = str(fd, "title");
  if (!title) {
    return { error: isBlock ? "What is the time for?" : "Whose appointment is it?" };
  }

  const starts = instantFrom(str(fd, "date"), str(fd, "start_time"), studio.timezone);
  if (!starts) return { error: "Check the date and time." };

  const minutes = Number(str(fd, "minutes"));
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) {
    return { error: "Length must be between 5 minutes and 24 hours." };
  }

  const ends = new Date(starts.getTime() + minutes * 60_000);

  const { error } = await supabase.from("bookings").insert({
    enquiry_id: null,
    artist_id: artistId,
    source: isBlock ? "block" : "manual",
    type: str(fd, "type") === "consultation" ? "consultation" : "session",
    title,
    notes: str(fd, "notes") || null,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    deposit_amount_pence: 0,
    // Nothing the owner puts in by hand is waiting on a deposit, so it must not
    // be swept away by the unpaid-hold release.
    deposit_status: isBlock ? "unpaid" : "paid",
  });

  if (error) return { error: overlapMessage(error.code, error.message, isBlock) };

  revalidatePath("/diary");
  return { ok: isBlock ? "Time blocked out." : "Added to the diary." };
}

export async function moveDiaryEntry(
  _prev: DiaryState,
  fd: FormData,
): Promise<DiaryState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const id = str(fd, "id");
  const { data: booking } = await supabase
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return { error: "That entry has gone." };

  const starts = instantFrom(str(fd, "date"), str(fd, "start_time"), studio.timezone);
  if (!starts) return { error: "Check the date and time." };

  // Keep the length it already had.
  const minutes =
    (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000;
  const ends = new Date(starts.getTime() + minutes * 60_000);

  const { error } = await supabase
    .from("bookings")
    .update({ starts_at: starts.toISOString(), ends_at: ends.toISOString() })
    .eq("id", id);

  if (error) return { error: overlapMessage(error.code, error.message) };

  revalidatePath("/diary");
  return { ok: "Moved." };
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
