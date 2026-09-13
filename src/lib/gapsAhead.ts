import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { freeSlots } from "@/lib/freeSlots";
import type { OpenSlot } from "@/app/(dashboard)/report/GapsWorthFilling";

/** How far ahead is worth looking. Past a fortnight nobody is selling it yet. */
const DAYS_AHEAD = 14;

/**
 * The sellable gaps in everybody's next fortnight.
 *
 * The awkward half of the question, kept away from freeSlots so that the
 * arithmetic can stay pure and tested: which days the business is open, whose
 * hours are whose, and what counts as long enough to sell.
 *
 * "Long enough" comes from the price list where there is one — the shortest
 * thing the business actually sells — because that is the honest threshold. A
 * salon whose quickest service is a fifteen-minute fringe trim can sell a
 * twenty-minute gap; a tattooist whose shortest sitting is two hours cannot,
 * and telling them about a forty-minute window is telling them about nothing.
 */
export async function gapsAhead(
  db: SupabaseClient,
  studio: Studio,
  now: Date,
): Promise<OpenSlot[]> {
  const { data: people } = await db
    .from("artists")
    .select("id, name, hours")
    .eq("studio_id", studio.id)
    .eq("active", true);

  const team = (people ?? []) as { id: string; name: string; hours: Studio["hours"] | null }[];
  if (!team.length) return [];

  const until = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);

  const { data: booked } = await db
    .from("bookings")
    .select("artist_id, starts_at, ends_at")
    .in("artist_id", team.map((a) => a.id))
    .is("cancelled_at", null)
    .eq("blocks_availability", true)
    .gte("starts_at", now.toISOString())
    .lt("starts_at", until.toISOString());

  /*
   * The shortest thing on the price list, which is what makes a gap sellable.
   *
   * No list means no answer, and the fallback is half an hour — the shortest
   * thing most of these businesses will put in a diary at all.
   */
  const { data: services } = await db
    .from("services")
    .select("minutes")
    .eq("studio_id", studio.id)
    .eq("active", true)
    .eq("kind", "service")
    .not("minutes", "is", null)
    .order("minutes")
    .limit(1);

  const atLeast = (services?.[0]?.minutes as number | undefined) ?? 30;

  /** Which day something is on, and where it sits in it, in the shop's zone. */
  const zone = (iso: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: studio.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const hour = at.hour === "24" ? "00" : at.hour;
    return {
      day: `${at.year}-${at.month}-${at.day}`,
      minutes: Number(hour) * 60 + Number(at.minute),
    };
  };

  const busyBy = new Map<string, { from: number; to: number }[]>();
  for (const row of (booked ?? []) as { artist_id: string; starts_at: string; ends_at: string }[]) {
    const from = zone(row.starts_at);
    const to = zone(row.ends_at);
    const key = `${row.artist_id}|${from.day}`;
    busyBy.set(key, [
      ...(busyBy.get(key) ?? []),
      // Something running past midnight is clipped by freeSlots anyway; the
      // day it starts on is the day it takes up.
      { from: from.minutes, to: to.day === from.day ? to.minutes : 24 * 60 },
    ]);
  }

  const out: OpenSlot[] = [];

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = new Date(now.getTime() + i * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: studio.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

    /*
     * Which day of the week that is, taken from the date rather than from the
     * clock. `key` is already the shop's own calendar day, so reading the
     * weekday back out of it cannot disagree with it — which reading `date`
     * directly can, for a couple of hours either side of midnight.
     */
    const [y, m, d] = key.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

    const said = new Intl.DateTimeFormat("en-GB", {
      timeZone: studio.timezone,
      weekday: "long",
      day: "numeric",
      month: "short",
    }).format(date);

    for (const person of team) {
      // Their own week where they keep one, the shop's where they do not.
      const week = person.hours?.length ? person.hours : studio.hours;
      const open = week.find((h) => h.day === weekday);
      if (!open || open.closed) continue;

      const from = Number(open.open.slice(0, 2)) * 60 + Number(open.open.slice(3, 5));
      const to = Number(open.close.slice(0, 2)) * 60 + Number(open.close.slice(3, 5));

      /*
       * Today starts now, not this morning.
       *
       * Half past four on a Tuesday, reporting that this Tuesday morning is
       * free, is the report being wrong about the one day somebody can check
       * by looking up.
       */
      const startsAt = i === 0 ? Math.max(from, zone(now.toISOString()).minutes) : from;

      const busy = busyBy.get(`${person.id}|${key}`) ?? [];

      /*
       * A day with nothing in it is not a gap, it is a day.
       *
       * Without this the report is the empty diary rather than the holes in a
       * working one: measured against the demo it produced seventy-five
       * "gaps" and six hundred hours, nearly all of them a whole day from
       * nine to six. That is true and useless, and to a business three weeks
       * old it reads as the product pointing at how quiet they are.
       *
       * What somebody can act on is the Thursday afternoon between two
       * appointments — a day they are already coming in for, with a hole in
       * it that would take a client. A completely free Monday is a different
       * conversation, and one the person whose diary it is already knows
       * about.
       */
      if (busy.length === 0) continue;

      for (const gap of freeSlots({ from: startsAt, to }, busy, atLeast)) {
        out.push({
          artistId: person.id,
          who: person.name.split(" ")[0],
          day: said,
          from: gap.from,
          to: gap.to,
          minutes: gap.to - gap.from,
        });
      }
    }
  }

  // Soonest first: a gap on Thursday is worth more than one a fortnight out,
  // because there is still time to put somebody in it.
  return out;
}
