/**
 * Fills a studio's week with a realistic diary, so the design can be judged
 * against something that looks like a real business rather than an empty grid.
 *
 *   node scripts/demo-week.mjs "Test Salon"
 *
 * Safe to re-run: it clears anything it put there before, and touches nothing
 * that came from a real conversation.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
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

const name = process.argv[2] ?? "Test Salon";

const { data: studio } = await db
  .from("studios")
  .select("id, name, timezone")
  .eq("name", name)
  .single();
if (!studio) throw new Error(`No studio called "${name}"`);

// A working week, so the grid has closed hours to recede and open hours to fill.
await db
  .from("studios")
  .update({
    hours: [
      { day: 0, open: "10:00", close: "16:00", closed: true },
      { day: 1, open: "09:00", close: "18:00", closed: false },
      { day: 2, open: "09:00", close: "18:00", closed: false },
      { day: 3, open: "09:00", close: "20:00", closed: false },
      { day: 4, open: "09:00", close: "20:00", closed: false },
      { day: 5, open: "09:00", close: "18:00", closed: false },
      { day: 6, open: "09:00", close: "16:00", closed: false },
    ],
  })
  .eq("id", studio.id);

let { data: team } = await db.from("artists").select("id, name").eq("studio_id", studio.id);
if (!team?.length) throw new Error("Add somebody to the team first.");

// Monday of this week, in plain local terms — this is a demo, not the engine.
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

const plus = (date, minutes) => new Date(date.getTime() + minutes * 60000);

// Day, start hour, minutes, category, title, and whether a deposit is owed.
const WEEK = [
  [0, 9, 45, "appointment", "Marie Whitlock — cut & finish", false],
  [0, 11, 90, "appointment", "Dani Okafor — half head", false],
  [0, 13, 30, "break", "Lunch", false],
  [0, 14, 180, "appointment", "Priya Shah — balayage", true],
  [1, 9, 30, "admin", "Order stock", false],
  [1, 10, 60, "appointment", "Tom Beal — restyle", false],
  [1, 12, 45, "appointment", "Ellie Ward — cut & finish", false],
  [1, 15, 120, "appointment", "Sam Doyle — full head", false],
  [2, 9, 45, "appointment", "Ruth Kelly — blow dry", false],
  [2, 11, 90, "consultation", "Colour consultation — new client", false],
  [2, 14, 60, "appointment", "Jay Morrow — cut & beard", false],
  [2, 17, 120, "appointment", "Nadia Rahman — highlights", true],
  [3, 9, 30, "appointment", "Cara Finn — trim", false],
  [3, 11, 210, "appointment", "Bridal trial — Amy", true],
  [3, 16, 60, "meeting", "Rep visit — colour range", false],
  [4, 10, 45, "appointment", "Owen Pryce — cut", false],
  [4, 12, 90, "appointment", "Leah Sutton — root tint", false],
  [4, 15, 45, "appointment", "Ben Aldridge — cut", false],
  [5, 9, 240, "personal", "Training day", false],
];

// Clear anything a previous run left, then lay the week out.
await db.from("bookings").delete().is("enquiry_id", null).in(
  "artist_id",
  team.map((a) => a.id),
);

/** Sixty-five pounds an hour, rounded to a price somebody would actually say. */
function priceFor(minutes) {
  const pounds = Math.round((minutes / 60) * 65);
  return Math.round(pounds / 5) * 5 * 100;
}

const rows = WEEK.map(([day, hour, minutes, category, title, unpaid], i) => {
  const starts = at(day, hour, hour % 1 ? 30 : 0);
  return {
    artist_id: team[i % team.length].id,
    starts_at: starts.toISOString(),
    ends_at: plus(starts, minutes).toISOString(),
    type: category === "consultation" ? "consultation" : "session",
    category,
    title,
    all_day: false,
    blocks_availability: true,
    // Manual throughout: the schema rightly refuses an assistant booking
    // with no enquiry behind it, and this script has no conversations.
    source: "manual",
    /*
     * What the job comes to.
     *
     * Priced off how long it takes, which is roughly how these businesses
     * actually price. Without it the week reads "£0 worth" next to twenty-odd
     * booked hours, and the first thing anybody asks is whether the figure
     * works at all.
     */
    price_pence:
      category === "appointment" || category === "consultation"
        ? priceFor(minutes)
        : null,
    deposit_amount_pence: unpaid ? 3000 : 0,
    deposit_status: unpaid ? "unpaid" : "paid",
  };
});

const { error, count } = await db.from("bookings").insert(rows, { count: "exact" });
if (error) {
  console.error("insert failed:", JSON.stringify(error, null, 1));
  process.exit(1);
}

console.log(`Filled ${studio.name}'s week with ${count ?? rows.length} entries.`);
