/**
 * Everything the demo could not previously show.
 *
 *   node scripts/demo-depth.mjs
 *
 * The demo salon was five stylists on one rate with one price list, which
 * demonstrated the diary and nothing else. Every per-person feature built since
 * — own prices, own services, client timings, the assistant's name, reminders
 * and travel — was invisible on it, so the only way to see any of them was to
 * be told they existed.
 *
 * This layers them on. Re-runnable: everything is matched by name and updated
 * rather than duplicated, so it can be run after demo-salon.mjs as often as
 * you like.
 *
 * Demo only, and it checks. A script that writes prices and services has no
 * business anywhere near a real one.
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

const { data: studio } = await db
  .from("studios")
  .select("id, name, kind")
  .eq("slug", "willow-demo")
  .maybeSingle();

if (!studio) throw new Error("No demo salon. Run demo-salon.mjs first.");
if (studio.kind !== "demo") throw new Error(`${studio.name} is not a demo — refusing.`);

const say = (line) => console.log(line);

// ─────────────────────────────────────────────────────── price by the list
//
// The salon's own list is the thing every per-person price is measured
// against, so nothing below means anything until this is the model in use.
await db.from("studios").update({ pricing_model: "services", assistant_name: "Robin" }).eq("id", studio.id);
say("prices by the named list, assistant called Robin");

// ───────────────────────────────────────────────────────────── the people
//
// A nail technician, because she is the case the shop's price list cannot
// describe: her work is hers, no stylist there does any of it, and a salon
// that put her twenty colours on the wall would need a bigger wall.
const TEAM = [
  ["Sarah", "#e0507a", "Senior stylist", 6200, 3800, "Robin"],
  ["Priya", "#5aa84f", "Colourist", 5500, 3500, "Robin"],
  ["Mo", "#2f8fd6", "Stylist", 4800, 2800, "Robin"],
  ["Chloe", "#b07acc", "Stylist", 4500, 2600, "Robin"],
  ["Jade", "#e0913a", "Apprentice", 3000, 1800, "Robin"],
  // Her own Instagram, so her own assistant as far as her clients know.
  ["Aisha", "#3aa8a0", "Nail technician", 4000, 2500, "Immy"],
];

const people = {};
for (const [name, colour, role, rate, minimum, agent] of TEAM) {
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
    hourly_rate_pence: rate,
    min_charge_pence: minimum,
    assistant_name: agent,
  };

  if (already) {
    await db.from("artists").update(row).eq("id", already.id);
    people[name] = already.id;
  } else {
    const { data, error } = await db.from("artists").insert(row).select("id").single();
    if (error) throw new Error(`${name}: ${error.message}`);
    people[name] = data.id;
  }
}
say(`${TEAM.length} people, rates from £30 to £62 an hour`);

// ───────────────────────────────────────────────────────── the shop's list
//
// What everybody there does, at the shop's price. Lengths are the truth
// rather than the best case, because the length is what gets booked.
const SHOP = [
  ["Cut and blow dry", 45, 3800, null, false],
  ["Dry cut", 30, 2800, null, false],
  ["Blow dry", 30, 2400, null, false],
  ["Half head of foils", 120, 9500, 12000, false],
  ["Full head of highlights", 180, 13500, 17000, false],
  ["Balayage", 150, 14000, 19000, true],
  ["Gloss and toner", 45, 3500, null, false],
  ["Wedding hair", 120, 8500, 14000, true],
  ["Children's cut", 20, 1600, null, false],
];

const services = {};
for (const [i, [name, minutes, from, to, consult]] of SHOP.entries()) {
  const { data: already } = await db
    .from("services")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("name", name)
    .is("artist_id", null)
    .maybeSingle();

  const row = {
    studio_id: studio.id,
    artist_id: null,
    name,
    kind: "service",
    minutes,
    price_pence: from,
    price_to_pence: to,
    requires_consultation: consult,
    bookable_online: true,
    active: true,
    sort_order: i,
  };

  if (already) {
    await db.from("services").update(row).eq("id", already.id);
    services[name] = already.id;
  } else {
    const { data, error } = await db.from("services").insert(row).select("id").single();
    if (error) throw new Error(`${name}: ${error.message}`);
    services[name] = data.id;
  }
}
say(`${SHOP.length} things the salon does`);

// ───────────────────────────────────────────────────────── Aisha's own list
//
// Hers, and offered only to somebody asking for her. A client asking the salon
// about a haircut is never read a colour chart.
const HERS = [
  ["Gel manicure", "service", 45, 3200, null],
  ["Gel infill", "service", 40, 2800, null],
  ["Gel removal", "service", 20, 1200, null],
  ["Builder gel full set", "service", 90, 5500, null],
  ["Nail art, per nail", "service", 10, 500, null],
  ["Cuticle oil", "product", null, 900, null],
  ["Strengthening base coat", "product", null, 1400, null],
];

let hersMade = 0;
for (const [i, [name, kind, minutes, from, to]] of HERS.entries()) {
  const { data: already } = await db
    .from("services")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("name", name)
    .eq("artist_id", people.Aisha)
    .maybeSingle();

  const row = {
    studio_id: studio.id,
    artist_id: people.Aisha,
    name,
    kind,
    minutes,
    price_pence: from,
    price_to_pence: to,
    requires_consultation: false,
    bookable_online: true,
    active: true,
    sort_order: 100 + i,
  };

  if (already) await db.from("services").update(row).eq("id", already.id);
  else {
    const { error } = await db.from("services").insert(row);
    if (error) throw new Error(`${name}: ${error.message}`);
  }
  hersMade += 1;
}
say(`${hersMade} things only Aisha does, including two she sells over the counter`);

// ───────────────────────────────────────────────── what each of them charges
//
// Only where they differ, which is the point: most rows stay on the shop's
// price and a handful do not. A senior charges more for a cut and is quicker
// at it; an apprentice charges less and takes longer.
const THEIRS = [
  ["Sarah", "Cut and blow dry", 4800, 40],
  ["Sarah", "Wedding hair", 16000, null],
  ["Priya", "Balayage", 17500, null],
  ["Priya", "Full head of highlights", 15500, 165],
  ["Jade", "Cut and blow dry", 2400, 60],
  ["Jade", "Blow dry", 1800, 40],
  ["Mo", "Dry cut", 3200, null],
];

for (const [who, what, price, minutes] of THEIRS) {
  const serviceId = services[what];
  if (!serviceId || !people[who]) continue;
  await db.from("service_people").upsert(
    { service_id: serviceId, artist_id: people[who], price_pence: price, minutes },
    { onConflict: "service_id,artist_id" },
  );
}
say(`${THEIRS.length} prices somebody has set for themselves`);

// ──────────────────────────────────────────────── what only they knew
//
// The twenty minutes that lives in one person's head. Recorded against the
// client so it survives them being off, and never shown to the client.
const { data: clients } = await db
  .from("contacts")
  .select("id, name")
  .eq("studio_id", studio.id)
  .not("name", "is", null)
  .limit(4);

const TIMINGS = [
  [0, "Full head of highlights", 25, "Very thick hair — colour always overruns", false],
  [1, "Cut and blow dry", 15, "Likes to talk. Never rush her, she rebooks every time", false],
  [2, "Balayage", 30, "Previous box dye, needs a second application", true],
  [3, "Blow dry", -10, "Short hair, always quicker than the book says", false],
];

let timed = 0;
for (const [index, what, delta, note, chargeable] of TIMINGS) {
  const client = clients?.[index];
  const serviceId = services[what];
  if (!client || !serviceId) continue;
  await db.from("client_service_times").upsert(
    {
      contact_id: client.id,
      service_id: serviceId,
      minutes_delta: delta,
      chargeable,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contact_id,service_id" },
  );
  timed += 1;
}
say(`${timed} clients with a timing only the salon knows`);

// ───────────────────────────────────────────── whose reminders, and travel
//
// Aisha sends her own, so there is something to look at on both sides of the
// switch. Everybody else is on the salon's.
await db.from("artists").update({ reminders_own: true }).eq("id", people.Aisha);

const { data: already } = await db
  .from("reminder_templates")
  .select("id")
  .eq("artist_id", people.Aisha)
  .eq("hours_before", 24)
  .maybeSingle();

const hers = {
  studio_id: studio.id,
  artist_id: people.Aisha,
  label: "The day before",
  hours_before: 24,
  body: "Hi {{name}} — it's Immy, reminding you about your nails tomorrow at {{time}}. Come with bare nails if you can. Any problems just text back.",
  enabled: true,
  sort_order: 0,
};

if (already) await db.from("reminder_templates").update(hers).eq("id", already.id);
else await db.from("reminder_templates").insert(hers);

say("Aisha sends her own reminders, in her own words");

// ──────────────────────────────────────────────────────── a wedding party
//
// Four people on one Saturday morning, in three diaries, tied together. The
// thing a group booking is for, and the only way to see what one looks like
// without typing four of them in.
const saturday = (() => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d;
})();

const slot = (h, m) =>
  new Date(Date.UTC(saturday.getFullYear(), saturday.getMonth(), saturday.getDate(), h, m)).toISOString();

const PARTY = [
  ["The bride", "Sarah", 8, 0, 120, 16000],
  ["Bridesmaid — Ellie", "Priya", 8, 30, 60, 5500],
  ["Bridesmaid — Nula", "Mo", 9, 0, 60, 4800],
  ["Mother of the bride", "Chloe", 9, 30, 45, 3800],
];

await db.from("bookings").delete().eq("title", "The bride").eq("studio_id", studio.id);

const { data: existingGroup } = await db
  .from("booking_groups")
  .select("id")
  .eq("studio_id", studio.id)
  .eq("name", "Hannah's wedding")
  .maybeSingle();

if (existingGroup) {
  await db.from("bookings").delete().eq("group_id", existingGroup.id);
  await db.from("booking_groups").delete().eq("id", existingGroup.id);
}

const { data: wedding, error: weddingError } = await db
  .from("booking_groups")
  .insert({
    studio_id: studio.id,
    name: "Hannah's wedding",
    notes: "All arriving together at eight. Photographer at half eleven.",
  })
  .select("id")
  .single();

if (weddingError) {
  say(`no wedding party — ${weddingError.message}`);
} else {
  let booked = 0;
  for (const [who, withWho, h, m, mins, price] of PARTY) {
    const { error } = await db.from("bookings").insert({
      enquiry_id: null,
      contact_id: null,
      artist_id: people[withWho],
      group_id: wedding.id,
      source: "manual",
      type: "session",
      category: "appointment",
      all_day: false,
      blocks_availability: true,
      title: who,
      starts_at: slot(h, m),
      ends_at: slot(h, m + mins),
      price_pence: price,
      deposit_amount_pence: 0,
      deposit_status: "paid",
      repeats: "none",
    });
    if (!error) booked += 1;
  }
  say(`a wedding party of ${booked}, across three diaries, on Saturday morning`);
}

// ─────────────────────────────────────────────────────────── what it shows
say("");
say("The demo now shows, per person:");
say("  Settings → Pricing     the salon's nine services, and what each person charges");
say("  Settings → You         (as Sarah) her prices, her notifications, her reminders");
say("  A client record        the timings the salon knows and never mentions");
say("  Aisha                  her own list, her own reminders, and an assistant called Immy");
say("  Saturday morning       a wedding party of four, tied together across three diaries");
say("");
say("Sign in as demo@second-pair.com to see it as Sarah.");
