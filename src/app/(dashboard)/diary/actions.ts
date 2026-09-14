"use server";

import { revalidatePath } from "next/cache";
import { resolveContact } from "@/lib/clients/resolve";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { instantFrom } from "@/lib/booking/tz";
import { samePhone } from "@/lib/channels/phoneNumbers";
import { categoryFor, repeatDates, type RepeatRule } from "@/lib/calendar";
import { dropReminders } from "@/lib/reminders";
import { scheduleReminders } from "@/lib/reminders";
import { DIARY_LAYOUT_COOKIE, type DiaryLayout } from "@/lib/diaryLayout";

export type DiaryState = { error?: string; ok?: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

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
            title: str(fd, "title") || str(fd, "contact_name") || null,
            notes: str(fd, "notes") || null,
            price_pence: priceOf(fd),
            contact_id: await fromPicker(supabase, studio.id, fd),
          };

    const { error } = await supabase.from("bookings").update(patch).eq("id", id);
    if (error) return { error: clashMessage(error.code, error.message) };

    // A moved appointment needs its reminders moved with it, and whose it is
    // decides whose reminders they are.
    await scheduleReminders(supabase, studio.id, id, starts.toISOString(), artistId);

    revalidatePath("/diary");
    return { ok: "Saved." };
  }

  // ---------------------------------------------------------------- adding
  //
  // Client bookings are titled by who they are for, so somebody booking Marie
  // in over the phone types her name once rather than into two fields.
  const contactId = await fromPicker(supabase, studio.id, fd);
  const title = str(fd, "title") || str(fd, "contact_name");
  if (!title) return { error: "Give it a title, or say who it is for." };

  const repeats = (str(fd, "repeats") || "none") as RepeatRule;
  const untilRaw = str(fd, "repeat_until");
  const until = /^\d{4}-\d{2}-\d{2}$/.test(untilRaw)
    ? new Date(`${untilRaw}T23:59:59Z`)
    : null;

  const base = {
    enquiry_id: null,
    contact_id: contactId,
    artist_id: artistId,
    source: definition.blocks && category !== "meeting" ? "block" : "manual",
    type: category === "consultation" ? "consultation" : "session",
    category,
    all_day: allDay,
    blocks_availability: definition.blocks,
    title,
    notes: str(fd, "notes") || null,
    // What the job comes to. The week's takings used to be read off the
    // assistant's quote, so anything typed in by hand was worth nothing.
    price_pence: priceOf(fd),
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
 * Closing a booking off: did they turn up?
 *
 * The column has existed since the first migration, labelled "metric: no-show
 * rate", and four places in the product read it — the client record counts
 * them, the timeline marks them, the export has a column for them, and the
 * report has a no-show figure. Nothing has ever written it. So every one of
 * those numbers has been a confident zero since the day it shipped, which is
 * worse than not having the figure at all.
 *
 * Three states, not two. Null is "nobody has said", and it has to stay
 * reachable: somebody who taps "no-show" on the wrong appointment needs a way
 * back that is not claiming they turned up.
 */
export async function closeBooking(fd: FormData) {
  const supabase = await createClient();

  const said = str(fd, "attended");
  const attended = said === "yes" ? true : said === "no" ? false : null;

  /*
   * How long it really took, and what happened.
   *
   * Both optional, and they stay that way. Somebody closing a booking off at
   * half past five is answering "did they come"; made to answer "how long
   * exactly" as well, they stop answering either. The value of this column
   * comes from the times somebody bothers, and nothing is gained by pressing.
   *
   * Absent means "not asked" and is left alone rather than written as null —
   * so pressing the buttons a second time cannot wipe a duration somebody
   * typed the first time.
   */
  const patch: Record<string, unknown> = {
    attended,
    updated_at: new Date().toISOString(),
  };

  if (fd.has("actual_minutes")) {
    const raw = str(fd, "actual_minutes");
    const n = Number(raw);
    patch.actual_minutes = raw !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  if (fd.has("outcome_note")) {
    patch.outcome_note = str(fd, "outcome_note") || null;
  }

  /*
   * Tenancy is the row-level policy's job here, as it is for cancelling: the
   * signed-in client cannot see a booking that is not theirs, so it cannot
   * update one either.
   */
  await supabase.from("bookings").update(patch).eq("id", str(fd, "id"));

  /*
   * And, where somebody asked for it, remember it about the client.
   *
   * This is what the actual-time box was always for. On its own it is a number
   * on one finished appointment that nothing will read again. Kept here, it is
   * the reason her next colour is booked for two hours rather than ninety
   * minutes, and the reason the assistant stops offering her a slot that was
   * never long enough.
   *
   * Only ever when asked, and only from this button. Nothing infers it from a
   * single overrun, because one bad afternoon is not a fact about somebody.
   */
  if (fd.get("remember_time") && typeof patch.actual_minutes === "number") {
    await rememberTiming(supabase, str(fd, "id"), patch.actual_minutes);
  }

  revalidatePath("/diary");
  revalidatePath("/clients");
  revalidatePath("/report");
}

/**
 * Keep how long this client really takes over this service.
 *
 * Stored as a difference rather than a length, because the business's own
 * timing moves — a salon that takes its colour from ninety minutes to two
 * hours should not leave every regular pinned to a number set against the old
 * one. "Twenty minutes more than whatever it is" stays true when the book
 * changes underneath it.
 */
async function rememberTiming(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  actualMinutes: number,
): Promise<void> {
  const { data } = await supabase
    .from("bookings")
    .select("starts_at, ends_at, contact_id, enquiries(service_id)")
    .eq("id", bookingId)
    .maybeSingle();

  if (!data) return;

  const row = data as unknown as {
    starts_at: string;
    ends_at: string;
    contact_id: string | null;
    enquiries: { service_id: string | null } | null;
  };

  const serviceId = row.enquiries?.service_id ?? null;
  // Both halves, or nowhere to put it: the record is this client, this service.
  if (!row.contact_id || !serviceId) return;

  const booked = Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000);
  const delta = actualMinutes - booked;

  /*
   * The same sanity the client's own timing screen applies.
   *
   * More than four hours out is a typo far more often than it is a person —
   * 600 in a box meant for 60 — and this path has no way to ask. Writing it
   * would quietly make every future booking for that client four hours longer
   * and nobody would connect the two. So it is dropped, and the actual time is
   * still saved on the booking itself where somebody can see it.
   */
  if (Math.abs(delta) > 240) return;

  /*
   * Exactly as booked is worth writing as a zero rather than skipping.
   *
   * It records that somebody checked, which is not the same as nobody having
   * looked — and it clears an older difference that has stopped being true,
   * which is the only way somebody who has had her hair cut short gets back to
   * a normal-length appointment.
   */
  await supabase.from("client_service_times").upsert(
    {
      contact_id: row.contact_id,
      service_id: serviceId,
      minutes_delta: delta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contact_id,service_id" },
  );
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
  /*
   * Moved to somebody else's column, so it is their reminders now. The old
   * ones were dropped above rather than edited, which is what makes that safe.
   */
  await scheduleReminders(
    supabase,
    studio.id,
    input.id,
    starts.toISOString(),
    input.artistId,
  );

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
/**
 * List or grid, remembered.
 *
 * A cookie rather than the studio row, because unlike the colour setting this
 * is one person's preference and not the business's: the owner on her phone
 * between clients wants the agenda, and the same business at the desk wants
 * the columns. Storing it on the studio would have them fighting over it.
 *
 * A year, because the alternative is setting it again every morning. Lax so it
 * survives arriving from an emailed link, httpOnly because nothing in the
 * browser needs to read it, and secure everywhere except a local dev server.
 */
export async function setDiaryLayout(layout: DiaryLayout) {
  // Signed in, so a stranger cannot set cookies on the diary by posting to it.
  await requireStudio();

  const jar = await cookies();
  jar.set(DIARY_LAYOUT_COOKIE, layout, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/diary");
}

export async function setDiaryColour(mode: "category" | "client" | "person") {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  await supabase.from("studios").update({ diary_colour: mode }).eq("id", studio.id);
  revalidatePath("/diary");
}

/**
 * Looking somebody up while booking them in.
 *
 * Scoped to the studio by row-level security, and capped — this runs on every
 * other keystroke and nobody scrolls past ten matches anyway.
 */
/**
 * What this business sells, for the form that books it.
 *
 * The manual form has always asked for a number of minutes, which means
 * somebody adding a colour has to remember how long a colour takes — and the
 * business has already written that down. Picking the thing fills in the
 * length and the price, and gets both right every time.
 */
export async function bookableServices() {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (studio.pricing_model !== "services") return [];

  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("studio_id", studio.id)
    .eq("active", true)
    .order("sort_order");

  return (data ?? [])
    .filter((s) => s.kind === "service" && s.minutes != null)
    .map((s) => ({
      id: s.id as string,
      name: s.name as string,
      minutes: s.minutes as number,
      price_pence: s.price_pence as number | null,
      artist_id: (s.artist_id as string | null) ?? null,
    }));
}

/**
 * How long this client takes over this, as against the book.
 *
 * The thing the salon knows and nobody else does: thick hair that always runs
 * twenty minutes over, somebody who cannot sit still. It has been recorded on
 * the client since it was built and only the assistant could read it — so
 * anybody booking by hand, which is most bookings in most salons, set aside
 * the standard time and ran late.
 *
 * Returns the note as well. Whoever is typing deserves to see why the number
 * moved, and it is the difference between a form that seems to guess and one
 * that is obviously repeating something a colleague wrote down.
 */
/**
 * What this client normally has, and when they were last in.
 *
 * Most bookings in a salon are a regular having the thing they always have, so
 * the fastest possible booking is one tap on what they had last time. Typing
 * it out again is the product asking somebody to look up what it already
 * knows.
 *
 * The summary is as much the point as the shortcut. Somebody on the phone
 * wants to say "you were in six weeks ago with Priya" without opening another
 * screen, and a no-show two visits ago is worth knowing before offering a
 * Saturday morning.
 */
export async function clientSummary(contactId: string) {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (!contactId) return null;

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name, alert")
    .eq("id", contactId)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!contact) return null;

  /*
   * Both ways a booking reaches a client: through a conversation the assistant
   * had, or attached directly when somebody typed it in. Reading only the
   * first would show an empty history for a regular who has only ever rung up,
   * which is most regulars.
   */
  const { data: direct } = await supabase
    .from("bookings")
    .select("id, starts_at, price_pence, attended, artist_id, artists(name), enquiry_id, title")
    .eq("contact_id", contactId)
    .is("cancelled_at", null)
    .order("starts_at", { ascending: false })
    .limit(20);

  const enquiryIds = (direct ?? []).map((b) => b.enquiry_id).filter(Boolean) as string[];

  const { data: enquiries } = enquiryIds.length
    ? await supabase.from("enquiries").select("id, service_id").in("id", enquiryIds)
    : { data: null };

  const serviceOf = new Map(
    (enquiries ?? []).map((e) => [e.id as string, (e.service_id as string | null) ?? null]),
  );

  /*
   * The whole price list, not only what the enquiries pointed at.
   *
   * It used to fetch just the services named by this person's enquiries, which
   * is the smaller query and answers the smaller question. Matching a
   * hand-typed title back to a real service needs the list itself — and that
   * is what turns "Cut and blow dry" written in a box into a shortcut that can
   * fill the length and the price in.
   */
  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .eq("studio_id", studio.id)
    .eq("active", true);

  const names = new Map((services ?? []).map((s) => [s.id as string, s.name as string]));

  /*
   * What they had, off the booking itself when there is no enquiry behind it.
   *
   * A named service only exists where the assistant took the enquiry and
   * recorded one. Nearly every booking in a real diary is typed in by hand, so
   * on live data this was null for eighteen visits out of nineteen — the panel
   * could say somebody had been in nineteen times and not one word about what
   * they had, which is the half anybody actually wants. The title is where
   * that has been written down all along.
   */
  const byName = new Map(
    (services ?? []).map((s) => [
      (s.name as string).trim().toLowerCase(),
      s.id as string,
    ]),
  );

  const visits = (direct ?? []).map((b) => {
    const fromEnquiry = serviceOf.get(b.enquiry_id as string) ?? null;
    const title = ((b.title as string | null) ?? "").trim();

    return {
      at: b.starts_at as string,
      with: (b.artists as unknown as { name: string } | null)?.name ?? null,
      what: (fromEnquiry ? names.get(fromEnquiry) : null) ?? (title || null),
      /*
       * Only a real service id, because tapping "the usual" picks one out of
       * the list above. A title matching a service by name is the same thing
       * said twice, so it counts; a title matching nothing is still worth
       * showing as history, and simply is not a shortcut.
       */
      serviceId: fromEnquiry ?? byName.get(title.toLowerCase()) ?? null,
      pence: (b.price_pence as number | null) ?? null,
      attended: (b.attended as boolean | null) ?? null,
    };
  });

  /*
   * What they usually have: the thing they have had most often, and only if
   * they have actually had it more than once. Offering "the usual" off a
   * single visit is a guess wearing a shortcut's clothes.
   */
  const counts = new Map<string, { id: string; name: string; times: number }>();
  for (const v of visits) {
    // Cancelled-out and no-shows still say what they came for, so they count
    // towards what somebody usually has.
    if (!v.serviceId || !v.what) continue;
    const seen = counts.get(v.serviceId) ?? { id: v.serviceId, name: v.what, times: 0 };
    seen.times += 1;
    counts.set(v.serviceId, seen);
  }

  const usual = [...counts.values()].sort((a, b) => b.times - a.times)[0] ?? null;

  return {
    name: contact.name as string | null,
    alert: (contact.alert as string | null) ?? null,
    visits: visits.slice(0, 4),
    total: visits.length,
    noShows: visits.filter((v) => v.attended === false).length,
    usual: usual && usual.times > 1 ? usual : null,
  };
}

export async function clientTiming(contactId: string, serviceId: string) {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  if (!contactId || !serviceId) return null;

  // Checked against this business, because both ids come from the browser.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!contact) return null;

  const { data } = await supabase
    .from("client_service_times")
    .select("minutes_delta, note, chargeable")
    .eq("contact_id", contactId)
    .eq("service_id", serviceId)
    .maybeSingle();

  return data ?? null;
}

export async function findClients(query: string) {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  /*
   * Name, number or email, and the number in either shape.
   *
   * Numbers are stored in full international form, so somebody typing 07700 —
   * which is how everybody types their own number — matched nothing at all.
   * That arrived this morning with the fix that stopped the same customer
   * being saved twice, and would have looked like the search being broken.
   *
   * Both forms are tried because either can be typed: a number copied off a
   * text arrives as +44, one read off a card arrives as 07.
   */
  const term = query.trim();
  const asDialled = samePhone(term);

  const clauses = [`name.ilike.%${term}%`, `email.ilike.%${term}%`, `phone.ilike.%${term}%`];
  if (asDialled && asDialled !== term) clauses.push(`phone.ilike.%${asDialled}%`);

  const { data } = await supabase
    .from("contacts")
    .select("id, name, phone, email, alert")
    .eq("studio_id", studio.id)
    .or(clauses.join(","))
    .order("name")
    .limit(8);

  return data ?? [];
}

/**
 * Resolves what the client picker submitted into a contact id.
 *
 * An existing client comes back with an id. A new name comes back without one
 * and gets a contact row created for them, so a booking taken over the phone
 * builds the same history an assistant booking would.
 */

/**
 * A price typed in pounds, kept in pence.
 *
 * Blank is null rather than zero: "I have not said" and "it is free" are
 * different, and a week's total should not be dragged down by every block of
 * time somebody put in their own diary.
 */
function priceOf(fd: FormData): number | null {
  const raw = String(fd.get("price") ?? "").trim().replace(/[£,\s]/g, "");
  if (!raw) return null;

  const pounds = Number(raw);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

/**
 * The client picker's fields, turned into a client.
 *
 * There were two of these: the shared one in lib/clients, and a private copy
 * here that took a name and nothing else. So a client added at the till got
 * their phone number kept and the same client added in the diary did not —
 * the same form, the same picker, two different answers, decided by which file
 * the action happened to live in.
 *
 * One rule now, named where the form names its fields.
 */
async function fromPicker(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  fd: FormData,
): Promise<string | null> {
  return resolveContact(supabase, studioId, {
    id: str(fd, "contact_id"),
    name: str(fd, "contact_name"),
    phone: str(fd, "contact_name_phone"),
    email: str(fd, "contact_name_email"),
    prefers: str(fd, "contact_name_prefers"),
  });
}
