/**
 * The demo salon: five chairs, a full week, and nobody real in it.
 *
 *   node scripts/demo-salon.mjs
 *
 * A standing business to look at rather than one built and thrown away every
 * time a screen needs judging. Design decisions kept getting made against
 * either an empty diary or a one-person one, and a five-chair salon behaves
 * nothing like either — names get buried, gaps stop meaning what they said,
 * and a row of filter chips runs off the side of a phone. None of that is
 * visible without a busy week in front of you.
 *
 * Safe to run as often as you like. It keeps the same studio, the same login
 * and the same people, and replaces the appointments so the week is always
 * this week — a demo showing last March is worse than no demo.
 *
 * Marked kind = "demo", so it stays out of the customer figures.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const NAME = "Willow & Co (demo)";
const SLUG = "willow-demo";
const EMAIL = "demo@second-pair.com";

const HOURS = [
  { day: 0, open: "10:00", close: "16:00", closed: true },
  ...[1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "18:00", closed: false })),
  { day: 6, open: "09:00", close: "17:00", closed: false },
];

// ------------------------------------------------------------------ studio

let { data: studio } = await db.from("studios").select("id").eq("slug", SLUG).maybeSingle();

const settings = {
  name: NAME,
  slug: SLUG,
  // The salon pack's own id. "hair" is one of its aliases and the id of
  // nothing, so storing that fell through to the general pack.
  vertical: "salon",
  kind: "demo",
  timezone: "Europe/London",
  deposit_mode: "none",
  // Whose it is, because that is the question a five-chair salon asks.
  diary_colour: "person",
  hours: HOURS,
  notice_hours: 12,
  consultation_minutes: 30,
  email: EMAIL,
  privacy_notice_url: "https://www.second-pair.com/privacy",
};

if (studio) {
  const { error } = await db.from("studios").update(settings).eq("id", studio.id);
  if (error) throw new Error(error.message);
} else {
  const { data, error } = await db.from("studios").insert(settings).select("id").single();
  if (error) throw new Error(error.message);
  studio = data;
}

// ------------------------------------------------------------------- team

const TEAM = [
  ["Sarah", "#e0507a", "Senior stylist"],
  ["Mo", "#2f8fd6", "Stylist"],
  ["Priya", "#5aa84f", "Colourist"],
  ["Chloe", "#b07acc", "Stylist"],
  ["Jade", "#e0913a", "Apprentice"],
];

const team = [];
for (const [name, colour, role] of TEAM) {
  const { data: already } = await db
    .from("artists")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("name", name)
    .maybeSingle();

  const row = {
    studio_id: studio.id,
    name,
    colour,
    role,
    active: true,
    booking_provider: "native",
    hourly_rate_pence: 4500,
    min_charge_pence: 2500,
  };

  if (already) {
    await db.from("artists").update(row).eq("id", already.id);
    team.push({ id: already.id, name });
  } else {
    const { data, error } = await db.from("artists").insert(row).select("id, name").single();
    if (error) throw new Error(`${name}: ${error.message}`);
    team.push(data);
  }
}

// --------------------------------------------------------------- clients

const NAMES = [
  "Jo Marsh", "Ellie Bright", "Tom Hale", "Nadia Khan", "Ruth Patel",
  "Dan Okafor", "Beth Crow", "Sam Idris", "Leah Frost", "Carl Nunn",
  "Ivy Sale", "Owen Pike", "Mia Webb", "Kit Rowan", "Ada Lyle",
];

const clients = [];
for (const [i, name] of NAMES.entries()) {
  const { data: already } = await db
    .from("contacts")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("name", name)
    .maybeSingle();

  if (already) {
    clients.push(already);
    continue;
  }

  const { data } = await db
    .from("contacts")
    .insert({ studio_id: studio.id, name, phone: `07700 900${String(400 + i)}` })
    .select("id")
    .single();
  clients.push(data);
}

// ----------------------------------------------------------- the week

/*
 * Cleared and rebuilt, so the week is always this week.
 *
 * Only this studio's own bookings, reached through its own people — there is
 * no studio_id on a booking, and this is the one place that matters because
 * getting it wrong here would delete somebody's real diary.
 */
for (const person of team) {
  await db.from("bookings").delete().eq("artist_id", person.id);
}

const now = new Date();
const monday = new Date(now);
monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
monday.setHours(0, 0, 0, 0);

const at = (dayOffset, hour, minute = 0) => {
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const SERVICES = [
  ["Cut and finish", 60, 4500],
  ["Half head foils", 90, 7500],
  ["Blow dry", 45, 3000],
  ["Balayage", 150, 12000],
  ["Full head colour", 120, 9500],
  ["Restyle", 75, 5500],
  ["Fringe trim", 20, 1200],
  ["Toner", 45, 3500],
];

/*
 * A week that looks like a week: Monday quiet, midweek full, Saturday solid,
 * and everybody with a lunch. Deterministic rather than random, so the same
 * screen can be compared with itself after a change.
 */
let n = 0;
let made = 0;

for (let day = 0; day < 6; day++) {
  const busy = [0.45, 0.7, 0.9, 0.85, 0.95, 1][day];

  for (const [who, person] of team.entries()) {
    // The apprentice works fewer days, which is what an apprentice does.
    if (who === 4 && day % 2 === 1) continue;

    let minute = 9 * 60 + (who % 2 ? 30 : 0);

    while (minute < 17 * 60) {
      n++;
      const [title, mins, price] = SERVICES[n % SERVICES.length];

      // A gap where the pattern says quiet, so the day is not a solid wall.
      if ((n * 7 + day * 3 + who) % 10 > busy * 10) {
        minute += 30;
        continue;
      }

      if (minute + mins > 17 * 60 + 30) break;

      const starts = at(day, Math.floor(minute / 60), minute % 60);
      await db.from("bookings").insert({
        artist_id: person.id,
        contact_id: clients[n % clients.length].id,
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + mins * 60_000).toISOString(),
        type: "session",
        title,
        // A quarter of them look like the assistant's work, which is the point
        // of the product and should be visible in the demo.
        source: n % 4 === 0 ? "assistant" : "manual",
        price_pence: price,
        deposit_amount_pence: 0,
        blocks_availability: true,
      });
      made++;

      minute += mins + 15;
    }
  }

  // Lunch for the two seniors, so the grid has non-appointment entries in it.
  for (const who of [0, 2]) {
    const starts = at(day, 13, who === 0 ? 0 : 30);
    await db.from("bookings").insert({
      artist_id: team[who].id,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 45 * 60_000).toISOString(),
      type: "session",
      title: "Lunch",
      category: "break",
      source: "manual",
      deposit_amount_pence: 0,
      blocks_availability: true,
    });
    made++;
  }
}

// A day off next week, so time off shows somewhere.
{
  const starts = at(8, 9, 0);
  await db.from("bookings").insert({
    artist_id: team[3].id,
    starts_at: starts.toISOString(),
    ends_at: at(8, 17, 0).toISOString(),
    type: "session",
    title: "Holiday",
    category: "holiday",
    source: "manual",
    all_day: true,
    deposit_amount_pence: 0,
    blocks_availability: true,
  });
  made++;
}

// ------------------------------------------------------------- the login

const password = "demo-" + Math.random().toString(36).slice(2, 10);

const { data: created, error: createError } = await db.auth.admin.createUser({
  email: EMAIL,
  password,
  email_confirm: true,
});

let userId = created?.user?.id;

if (!userId) {
  if (createError && !/already|registered|exists/i.test(createError.message)) {
    throw new Error(createError.message);
  }
  const { data: list } = await db.auth.admin.listUsers();
  userId = list.users.find((u) => u.email === EMAIL)?.id;
  if (userId) await db.auth.admin.updateUserById(userId, { password });
}

if (!userId) throw new Error("could not make or find the demo login");

await db.from("studio_members").upsert({
  studio_id: studio.id,
  user_id: userId,
  role: "owner",
});

/*
 * The demo login is Sarah, not a disembodied owner.
 *
 * Without this the account is a member of the business and nobody in the
 * diary, so Settings → You correctly says "you are not in the diary" and hides
 * everything that belongs to a person — their hours, their rates, their own
 * calendar. Which is right for a receptionist and wrong for a demonstration:
 * the whole of the per-person half of the product was invisible in it.
 *
 * The senior stylist, because in a five-chair salon the owner usually still
 * cuts hair, and because she is the one with a full column to look at.
 */
await db.from("artists").update({ user_id: userId }).eq("id", team[0].id);

console.log(`${NAME}`);
console.log(`  ${team.length} people, ${clients.length} clients, ${made} entries this week`);
console.log(`  kind: demo — kept out of the customer figures`);
console.log(`  sign in: ${EMAIL}`);
console.log(`  password: ${password}`);
console.log(`\n  Or open it from the back office, which needs no password.`);
