/*
 * What the morning email would say, without sending it.
 *
 *   npx tsx scripts/daily-brief-dry-run.mts [slug] [yyyy-mm-dd]
 *
 * The sender is proved by the weekly report, which has used the same path for
 * weeks. What is new here is who gets one and what is in it, and both of those
 * are worth reading before a real business wakes up to it.
 *
 * Reads the real diary. Sends nothing, writes nothing, claims no day.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { dailyBrief, type BriefBooking } from "../src/lib/dailyBrief.ts";
import { dailyBriefHtml } from "../src/lib/dailyBriefEmail.ts";

const slug = process.argv[2] ?? "amber-s-paws-pastures";
const day = process.argv[3] ?? new Date().toISOString().slice(0, 10);

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: studio } = await db
  .from("studios")
  .select("id, name, timezone, daily_brief_email, daily_brief_sent_on")
  .eq("slug", slug)
  .maybeSingle();
if (!studio) throw new Error(`no business with the slug ${slug}`);

const tz = studio.timezone ?? "Europe/London";
console.log(
  `${studio.name}  switch: ${studio.daily_brief_email ? "ON" : "off"}` +
    `  last sent: ${studio.daily_brief_sent_on ?? "never"}\n`,
);

/* The same midnight arithmetic the sender uses. */
function midnightAt(date: string): number {
  const shown = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(`${date}T12:00:00Z`));
  return Date.parse(`${date}T00:00:00Z`) + (12 - (Number(shown) % 24)) * 3600_000;
}
const tomorrow = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const from = new Date(midnightAt(day)).toISOString();
const to = new Date(midnightAt(tomorrow)).toISOString();

const { data: people } = await db
  .from("artists")
  .select("id, name, email")
  .eq("studio_id", studio.id)
  .eq("active", true);

const { data: rows, error } = await db
  .from("bookings")
  .select(
    "starts_at, ends_at, all_day, title, notes, price_pence, category, artist_id, " +
      "deposit_amount_pence, deposit_status, contacts(name, phone)",
  )
  .in("artist_id", (people ?? []).map((p) => p.id))
  .is("cancelled_at", null)
  .gte("starts_at", from)
  .lt("starts_at", to)
  .order("starts_at");
if (error) throw new Error(error.message);

const nameOf = new Map((people ?? []).map((p) => [p.id, p.name]));
const all: (BriefBooking & { artist_id: string })[] = (rows ?? []).map((r) => {
  const b = r as unknown as Record<string, unknown>;
  const contact = b.contacts as { name?: string | null; phone?: string | null } | null;
  return {
    artist_id: b.artist_id as string,
    starts_at: b.starts_at as string,
    ends_at: b.ends_at as string,
    all_day: (b.all_day as boolean) ?? false,
    title: (b.title as string) ?? null,
    notes: (b.notes as string) ?? null,
    price_pence: (b.price_pence as number) ?? null,
    category: (b.category as string) ?? null,
    who: nameOf.get(b.artist_id as string) ?? null,
    client: contact?.name ?? null,
    phone: contact?.phone ?? null,
    deposit_amount_pence: (b.deposit_amount_pence as number) ?? 0,
    deposit_status: (b.deposit_status as string) ?? null,
  };
});

const anchor = all[0]?.starts_at ?? `${day}T12:00:00Z`;
const owner = dailyBrief(all, {
  day: anchor,
  timeZone: tz,
  business: studio.name,
  manyPeople: (people ?? []).length > 1,
});

console.log("=== TO THE OWNER ".padEnd(70, "=") + "\n");
console.log(`Subject: ${owner.subject}\n`);
console.log(owner.text);

/* And the drawn one, written out so it can actually be looked at. */
const out = process.env.BRIEF_HTML;
if (out) {
  fs.writeFileSync(
    out,
    dailyBriefHtml(all, {
      day: anchor,
      timeZone: tz,
      business: studio.name,
      manyPeople: (people ?? []).length > 1,
      diaryUrl: "https://www.second-pair.com/diary",
    }),
  );
  console.log(`\nThe diary version written to ${out}`);
}

/*
 * Who the sender would actually write to.
 *
 * The owners' addresses, so a person whose email is also an owner's is
 * skipped exactly as the sender skips them. Without this the dry run shows
 * two emails where one is sent, which would make it a check that lies about
 * the thing it exists to check.
 */
const { data: owners } = await db
  .from("studio_members")
  .select("user_id")
  .eq("studio_id", studio.id)
  .eq("role", "owner");
const ownerEmails: string[] = [];
for (const o of owners ?? []) {
  const { data } = await db.auth.admin.getUserById(o.user_id as string);
  if (data.user?.email) ownerEmails.push(data.user.email.toLowerCase());
}
console.log(`\n(owners: ${ownerEmails.join(", ") || "none found"})`);

for (const person of people ?? []) {
  if (!person.email) continue;
  if (ownerEmails.includes(person.email.trim().toLowerCase())) {
    console.log(`\n(${person.name} is an owner, so gets the one above and not a second)`);
    continue;
  }
  const theirs = all.filter((b) => b.artist_id === person.id);
  const mine = dailyBrief(theirs, {
    day: theirs[0]?.starts_at ?? anchor,
    timeZone: tz,
    business: studio.name,
    forWhom: person.name?.split(" ")[0] ?? null,
  });
  console.log(`\n=== TO ${person.email} `.padEnd(70, "=") + "\n");
  console.log(`Subject: ${mine.subject}\n`);
  console.log(mine.text);
}
