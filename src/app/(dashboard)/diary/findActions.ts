"use server";

import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";

export type Found = {
  id: string;
  /** The day to open, as the diary's address wants it. */
  day: string;
  when: string;
  who: string;
  what: string;
};

/**
 * Finding an appointment without knowing when it is.
 *
 * The diary answers "what is happening on Thursday" perfectly and cannot
 * answer "when is Mrs Patel in", which is the question the phone actually
 * asks. The only way to it was to guess a week and look, or to go to the
 * client list, find her, and come back — and the second of those only became
 * possible today.
 *
 * Forward only. "When is she in" means next, not last March; the history is on
 * her record and is a different question asked in a different place.
 */
export async function findInDiary(term: string): Promise<Found[]> {
  const { studio } = await requireStudio();
  const wanted = term.trim();

  // Two characters, because one matches most of a book and the search would
  // run on every keystroke of somebody's name.
  if (wanted.length < 2) return [];

  const supabase = await createClient();
  const like = `%${wanted}%`;

  /*
   * People first, then their appointments.
   *
   * A name reaches a booking two ways — attached directly, or through the
   * conversation that made it — and asking PostgREST to match across both
   * joins in one `or` is the sort of query that works until somebody has no
   * conversation. Two small reads are slower on paper and right in every case.
   */
  const { data: people } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("studio_id", studio.id)
    .or(`name.ilike.${like},phone.ilike.${like}`)
    .limit(20);

  const contactIds = (people ?? []).map((c) => c.id as string);
  const now = new Date().toISOString();

  const [byPerson, byTitle] = await Promise.all([
    contactIds.length
      ? supabase
          .from("bookings")
          .select("id, starts_at, title, contact_id, artists!inner(name, studio_id)")
          .eq("artists.studio_id", studio.id)
          .in("contact_id", contactIds)
          .is("cancelled_at", null)
          .gte("starts_at", now)
          .order("starts_at")
          .limit(12)
      : Promise.resolve({ data: [] }),
    /*
     * And what it is called, for "when is the wedding party" — which is a
     * thing somebody searches for and is not anybody's name.
     */
    supabase
      .from("bookings")
      .select("id, starts_at, title, contact_id, artists!inner(name, studio_id)")
      .eq("artists.studio_id", studio.id)
      .ilike("title", like)
      .is("cancelled_at", null)
      .gte("starts_at", now)
      .order("starts_at")
      .limit(12),
  ]);

  const named = new Map(contactIds.map((id, i) => [id, (people ?? [])[i]?.name as string | null]));

  const rows = [...(byPerson.data ?? []), ...(byTitle.data ?? [])] as unknown as {
    id: string;
    starts_at: string;
    title: string | null;
    contact_id: string | null;
    artists: { name: string } | null;
  }[];

  // The same appointment can match both a name and its title.
  const seen = new Set<string>();

  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      day: r.starts_at.slice(0, 10),
      when: new Intl.DateTimeFormat("en-GB", {
        timeZone: studio.timezone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(r.starts_at)),
      who: (r.contact_id ? named.get(r.contact_id) : null) ?? r.title ?? "Appointment",
      what: [r.title, r.artists?.name?.split(" ")[0]].filter(Boolean).join(" · "),
    }));
}
