"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { zonedToUtc } from "@/lib/booking/tz";
import { categoryFor, repeatDates, type RepeatRule } from "@/lib/calendar";
import { dropReminders } from "@/lib/reminders";
import { scheduleReminders } from "@/lib/reminders";

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

    // A moved appointment needs its reminders moved with it.
    await scheduleReminders(supabase, studio.id, id, starts.toISOString());

    revalidatePath("/diary");
    return { ok: "Saved." };
  }

  // ---------------------------------------------------------------- adding
  const title = str(fd, "title");
  if (!title) return { error: "Give it a title." };

  const repeats = (str(fd, "repeats") || "none") as RepeatRule;
  const untilRaw = str(fd, "repeat_until");
  const until = /^\d{4}-\d{2}-\d{2}$/.test(untilRaw)
    ? new Date(`${untilRaw}T23:59:59Z`)
    : null;

  const base = {
    enquiry_id: null,
    artist_id: artistId,
    source: definition.blocks && category !== "meeting" ? "block" : "manual",
    type: category === "consultation" ? "consultation" : "session",
    category,
    all_day: allDay,
    blocks_availability: definition.blocks,
    title,
    notes: str(fd, "notes") || null,
    deposit_amount_pence: 0,
    // Nothing the owner adds is waiting on a deposit, so the unpaid-hold sweep
    // must never touch it.
    deposit_status: "paid",
    repeats,
    repeat_until: untilRaw || null,
  };

  const length = ends.getTime() - starts.getTime();
  const [y, m, d] = str(fd, "date").split("-").map(Number);
  const occurrences = repeatDates(new Date(y, m - 1, d), repeats, until);

  // Inserted one at a time, so a single clash skips that date rather than
  // failing the whole pattern — a weekly meeting should still land on the other
  // eleven weeks when one is already booked.
  let added = 0;
  let clashed = 0;
  let firstId: string | null = null;

  for (const occurrence of occurrences) {
    const at = instantFrom(
      `${occurrence.getFullYear()}-${String(occurrence.getMonth() + 1).padStart(2, "0")}-${String(
        occurrence.getDate(),
      ).padStart(2, "0")}`,
      allDay ? "00:00" : str(fd, "start_time"),
      studio.timezone,
    );
    if (!at) continue;

    const result: { data: { id: string } | null; error: { code?: string; message: string } | null } =
      await supabase
        .from("bookings")
        .insert({
          ...base,
          repeat_parent_id: firstId,
          starts_at: at.toISOString(),
          ends_at: new Date(at.getTime() + length).toISOString(),
        })
        .select("id")
        .single();

    if (result.error || !result.data) {
      if (result.error?.code === "23P01") clashed++;
      else if (added === 0) return { error: result.error?.message ?? "Could not add that." };
      continue;
    }

    added++;
    firstId ??= result.data.id;
  }

  if (added === 0) {
    return { error: clashMessage("23P01", "Could not add that.") };
  }

  revalidatePath("/diary");
  if (repeats === "none") return { ok: "Added." };
  return {
    ok:
      `Added ${added} times` +
      (clashed ? `. ${clashed} clashed with something already booked and were skipped.` : "."),
  };
}

/** Removes every future occurrence of a repeating entry, not just this one. */
export async function cancelSeries(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "id");

  const { data: entry } = await supabase
    .from("bookings")
    .select("id, repeat_parent_id, starts_at")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return;

  const rootId = entry.repeat_parent_id ?? entry.id;
  const now = new Date().toISOString();

  // Past occurrences stay as history; only what is still to come is dropped.
  await supabase
    .from("bookings")
    .update({ cancelled_at: now })
    .or(`id.eq.${rootId},repeat_parent_id.eq.${rootId}`)
    .gte("starts_at", entry.starts_at)
    .is("cancelled_at", null);

  revalidatePath("/diary");
}

export async function cancelDiaryEntry(fd: FormData) {
  const supabase = await createClient();
  // Nobody should get a reminder about an appointment that is not happening.
  await dropReminders(supabase, str(fd, "id"));
  // Cancelled rather than deleted: the slot frees up, the history stays, and a
  // paid deposit remains traceable for a refund.
  await supabase
    .from("bookings")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", str(fd, "id"));

  revalidatePath("/diary");
  revalidatePath("/");
}

/**
 * Moving or resizing an entry by dragging it.
 *
 * Kept separate from saveDiaryEntry because it is a different kind of edit: no
 * form, no category, no repeat rule — just new times, and possibly a different
 * person's column. Reusing the form action would mean sending twenty fields
 * back to change two, and any field the drag forgot would be wiped.
 *
 * Only this one occurrence moves. Dragging one instance of a repeating entry
 * detaches nothing and rewrites nothing else, which is what somebody nudging
 * next Tuesday half an hour later actually means.
 */
export async function moveDiaryEntry(input: {
  id: string;
  startsAt: string;
  endsAt: string;
  artistId?: string;
}): Promise<DiaryState> {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    return { error: "That time did not make sense." };
  }
  if (ends <= starts) return { error: "It has to end after it starts." };

  // Belt and braces on top of row-level security: the id arrives from the
  // browser, and this must never reach into another business's diary.
  const team = await getArtists(studio.id);
  const owned = team.map((a) => a.id);
  if (input.artistId && !owned.includes(input.artistId)) {
    return { error: "That is not one of your team." };
  }

  const patch: Record<string, unknown> = {
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
  };
  if (input.artistId) patch.artist_id = input.artistId;

  const { error } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", input.id)
    .in("artist_id", owned);

  if (error) {
    return { error: clashMessage(error.code, "That could not be moved.") };
  }

  // The reminder said "Tuesday at two". It is not Tuesday at two any more.
  await dropReminders(supabase, input.id);
  await scheduleReminders(supabase, studio.id, input.id, starts.toISOString());

  revalidatePath("/diary");
  revalidatePath("/");
  return { ok: "Moved." };
}

/**
 * What the colours in the diary mean.
 *
 * Stored on the business rather than the person: a salon wants everyone
 * looking at the same diary reading it the same way, and arguing about whose
 * colours are right is not a feature.
 */
export async function setDiaryColour(mode: "category" | "client" | "person") {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  await supabase.from("studios").update({ diary_colour: mode }).eq("id", studio.id);
  revalidatePath("/diary");
}
