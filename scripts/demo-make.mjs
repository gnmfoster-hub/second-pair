/**
 * Demo businesses that are not a hair salon.
 *
 *   node scripts/demo-make.mjs            every one of them
 *   node scripts/demo-make.mjs sparks     just that one
 *
 * The salon demo has done a lot of work, and it has quietly become the only
 * shape anybody judges the product in. A salon is five people in one room,
 * priced by a named list, taking no deposits and selling shampoo. It is not
 * an electrician pricing by the hour at somebody's house, a groomer who wants
 * a deposit because a no-show costs the whole slot, a garage booking bays and
 * charging VAT, or an instructor with one car and a standing Tuesday lesson.
 *
 * Each of these is seeded the way a real new business is — through the trade
 * pack, with seedFromPack's own services, words and FAQs — so what shows up
 * is genuinely what a business of that shape would get on day one, rather
 * than a salon with different names typed over it. If a screen is secretly
 * salon-shaped, these are what makes it obvious.
 *
 * Safe to run again: it keeps the same businesses, logins and people, and
 * rebuilds this week's diary so it is always this week.
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

const weekdays = (open, close) => [
  { day: 0, open: "10:00", close: "16:00", closed: true },
  ...[1, 2, 3, 4, 5].map((day) => ({ day, open, close, closed: false })),
  { day: 6, open, close, closed: true },
];

/*
 * Opening hours are part of the shape of a business, not decoration.
 *
 * A groomer works Tuesday to Saturday and is shut on a Monday; a garage opens
 * early and does Saturday mornings; an instructor teaches after work and at
 * weekends. Left as Monday-to-Friday, every one of these demos quietly became
 * an office, and the first thing anybody asks a groomer is "any Saturdays?".
 */
const open = (spec) => [0, 1, 2, 3, 4, 5, 6].map((day) => {
  const said = spec[day];
  return said
    ? { day, open: said[0], close: said[1], closed: false }
    : { day, open: "09:00", close: "17:00", closed: true };
});

/*
 * Five businesses, chosen because they work differently from each other
 * rather than because they are different trades. Between them they cover:
 * going to the customer and having them come to you, pricing by the hour and
 * by a fixed list, deposits and none, VAT added and VAT included and none at
 * all, one person and a team, a standing weekly booking, a form that has to
 * be signed first, and a business with nothing filled in yet.
 */
const DEMOS = [
  {
    key: "sparks",
    name: "Ashcroft Electrical (demo)",
    slug: "ashcroft-demo",
    vertical: "electrician",
    email: "demo-sparks@second-pair.com",
    settings: {
      hours: open({ 1: ["07:30", "17:00"], 2: ["07:30", "17:00"], 3: ["07:30", "17:00"], 4: ["07:30", "17:00"], 5: ["07:30", "16:00"] }),
      travel_mode: "at_customer",
      service_areas: ["BS", "BA", "GL"],
      deposit_mode: "none",
      takes_payments: true,
      payment_model: "business",
      vat_registered: true,
      prices_include_vat: false,
      vat_rate_percent: 20,
      vat_number: "GB 412 8890 21",
      travel_buffer_minutes: 30,
      notice_hours: 24,
      consultation_minutes: 45,
      diary_colour: "category",
      cancellation_policy:
        "Tell us the day before if you need to move a visit. A missed appointment with nobody in is charged at the call-out rate.",
    },
    team: [
      ["Dave Ashcroft", "#2f8fd6", "Electrician", 6500, 9500],
      ["Tom Reilly", "#5aa84f", "Apprentice", 3200, 4500],
    ],
    clients: [
      ["Maureen Clifford", "07700 900301", "BS7 9QT"],
      ["Raj Bhatia", "07700 900302", "BS6 5NB"],
      ["Helen Marsh", "07700 900303", "BA1 2PT"],
      ["Gary Whitlock", "07700 900304", "BS16 1AF"],
      ["Sue Pemberton", "07700 900305", "GL5 3JQ"],
      ["Nathan Doyle", "07700 900306", "BS9 4DP"],
      ["Priti Shah", "07700 900307", "BA2 7AY"],
      ["Colin Eames", "07700 900308", "BS4 2HW"],
    ],
    work: [
      ["Fault finding — lights out upstairs", 90, 13500],
      ["Consumer unit upgrade", 300, 48000],
      ["EICR safety certificate", 210, 24000],
      ["Sockets in the garage", 120, 16500],
      ["EV charger installation", 300, 79500],
      ["Call-out — no power to the oven", 60, 9500],
    ],
    asks: [
      "Hi, our upstairs lights keep tripping the board. Are you about this week?",
      "How much for an EICR on a 3-bed in Bath? Landlord needs one.",
      "Do you do EV chargers? We're getting a car in October.",
    ],
  },
  {
    key: "paws",
    name: "Pawfect Grooming (demo)",
    slug: "pawfect-demo",
    vertical: "dog_groomer",
    email: "demo-paws@second-pair.com",
    settings: {
      hours: open({ 2: ["08:30", "17:00"], 3: ["08:30", "17:00"], 4: ["08:30", "17:00"], 5: ["08:30", "17:00"], 6: ["08:30", "15:00"] }),
      travel_mode: "at_premises",
      deposit_mode: "required",
      takes_payments: true,
      payment_model: "business",
      vat_registered: false,
      notice_hours: 24,
      consultation_minutes: 20,
      diary_colour: "person",
      cancellation_policy:
        "The deposit holds your slot. Give us 48 hours if you need to move it and it moves with you; less than that and we keep it, because the slot goes empty.",
    },
    team: [
      ["Kerry Nolan", "#b07acc", "Groomer", 4200, 3000],
      ["Amy Fitch", "#e0913a", "Groomer", 3800, 2800],
    ],
    clients: [
      ["Janet Foulkes", "07700 900311", "Bramble, cockapoo"],
      ["Marcus Bell", "07700 900312", "Otis, labrador"],
      ["Sian Roberts", "07700 900313", "Pixie, shih tzu"],
      ["Danny Ford", "07700 900314", "Rufus, spaniel"],
      ["Charlotte Innes", "07700 900315", "Willow, poodle"],
      ["Ben Achebe", "07700 900316", "Dot, terrier"],
      ["Lorna Kee", "07700 900317", "Bear, newfoundland"],
    ],
    work: [
      ["Full groom — cockapoo", 120, 5500],
      ["Bath and tidy", 60, 3000],
      ["Puppy first visit", 45, 2500],
      ["Full groom — spaniel", 90, 4500],
      ["Nails and ears", 20, 1200],
      ["De-shed treatment", 75, 4200],
    ],
    /*
     * The one thing a groomer asks for that a salon does not: proof the dog is
     * vaccinated, before it comes anywhere near the other dogs. It is also the
     * clearest test of "needs a form first" outside the trade it was built in.
     */
    form: {
      name: "Vaccination record and consent",
      kind: "consent",
      requiredFor: ["Full groom", "Puppy first visit"],
      blocks: [
        { type: "text", label: "Before your dog's first groom we need their vaccination record and a few details. It takes two minutes and we only ask once." },
        { type: "short", label: "Your dog's name", required: true },
        { type: "short", label: "Breed", required: true },
        { type: "date", label: "Date of last vaccination", required: true },
        { type: "yesno", label: "Any health conditions, allergies or medication we should know about?", detailOnYes: true, required: true },
        { type: "yesno", label: "Has your dog ever bitten or snapped at a groomer?", detailOnYes: true, required: true },
        { type: "choice", label: "If the coat is badly matted, what would you rather we did?", options: ["Clip it short — kindest for the dog", "Ring me first", "Do what you think best"], required: true },
        { type: "agree", label: "I confirm my dog is vaccinated and the details above are correct.", required: true },
        { type: "signature", label: "Sign here", required: true },
      ],
    },
    asks: [
      "Hi! Bramble is due a full groom, he's a cockapoo and gets matted. Any Saturdays?",
      "Do you take puppies for their first visit? She's 16 weeks.",
      "Can I book Otis in before we go away on the 24th?",
    ],
  },
  {
    key: "cogs",
    name: "Cogs & Co Garage (demo)",
    slug: "cogs-demo",
    vertical: "garage",
    email: "demo-cogs@second-pair.com",
    settings: {
      hours: open({ 1: ["08:00", "17:30"], 2: ["08:00", "17:30"], 3: ["08:00", "17:30"], 4: ["08:00", "17:30"], 5: ["08:00", "17:30"], 6: ["08:30", "12:30"] }),
      travel_mode: "at_premises",
      deposit_mode: "none",
      takes_payments: true,
      payment_model: "business",
      vat_registered: true,
      prices_include_vat: true,
      vat_rate_percent: 20,
      vat_number: "GB 776 2210 43",
      notice_hours: 4,
      consultation_minutes: 30,
      diary_colour: "person",
      cancellation_policy:
        "Ring us if you cannot make it and we will move it. We hold the bay for half an hour, then it goes to somebody else.",
    },
    team: [
      ["Bay 1 — Stevie", "#2f8fd6", "Technician", 5400, 4500],
      ["Bay 2 — Mark", "#5aa84f", "Technician", 5400, 4500],
      ["MOT bay — Pete", "#e0507a", "MOT tester", 5800, 5500],
    ],
    clients: [
      ["Gemma Wren", "07700 900321", "Fiesta, WR19 KLM"],
      ["Ade Salami", "07700 900322", "Golf, BD70 XNT"],
      ["Carol Dunn", "07700 900323", "Yaris, LC15 PPO"],
      ["Wes Tanner", "07700 900324", "Transit, YJ21 FVB"],
      ["Nina Baptiste", "07700 900325", "Corsa, RV68 UUE"],
      ["Frank Mellor", "07700 900326", "Passat, KX17 GZR"],
      ["Ruby Aoki", "07700 900327", "Civic, MA20 CDS"],
    ],
    work: [
      ["MOT", 60, 5500],
      ["MOT and interim service", 120, 14500],
      ["Full service", 180, 18000],
      ["Diagnostic — engine light", 60, 5000],
      ["Brake pads and discs, front", 120, 21000],
      ["Interim service", 90, 11000],
    ],
    asks: [
      "MOT due end of the month on the Golf — what have you got?",
      "Engine light came on this morning, is it safe to drive? Can you look today?",
      "How much for front pads and discs on a 2017 Passat?",
    ],
  },
  {
    key: "dan",
    name: "Dan's Driving School (demo)",
    slug: "dansdriving-demo",
    vertical: "driving_instructor",
    email: "demo-dan@second-pair.com",
    settings: {
      hours: open({ 1: ["09:00", "20:00"], 2: ["09:00", "20:00"], 3: ["09:00", "20:00"], 4: ["09:00", "20:00"], 5: ["09:00", "18:00"], 6: ["09:00", "15:00"] }),
      travel_mode: "at_customer",
      service_areas: ["BS", "BA"],
      deposit_mode: "optional",
      takes_payments: true,
      payment_model: "business",
      vat_registered: false,
      notice_hours: 24,
      consultation_minutes: 60,
      travel_buffer_minutes: 15,
      diary_colour: "client",
      cancellation_policy:
        "Twenty-four hours' notice and we move the lesson for nothing. Less than that and the lesson is charged, because the hour cannot be filled.",
    },
    team: [["Dan Whitfield", "#e0913a", "Instructor", 3500, 3000]],
    clients: [
      ["Ellis Gray", "07700 900331", "Test booked 14 Nov", "BS5 8AA"],
      ["Tia Mensah", "07700 900332", "Nervous at roundabouts", "BS7 8PQ"],
      ["Josh Peart", "07700 900333", "Block of ten, 4 left", "BS16 2LR"],
      ["Freya Lomax", "07700 900334", "Manual, started August", "BA2 3TT"],
      ["Sam Okon", "07700 900335", "Motorway lessons", "BS3 4NN"],
      ["Kayleigh Best", "07700 900336", "Theory passed", "BS5 9HH"],
    ],
    work: [
      ["Single lesson", 60, 3500],
      ["Two-hour lesson", 120, 6800],
      ["First lesson", 60, 3000],
      ["Motorway lesson", 120, 6800],
      ["Mock test", 60, 3500],
    ],
    asks: [
      "Hi Dan, can I move Thursday's lesson to Friday same time?",
      "How much is a block of ten and can I pay in two goes?",
      "My test is on the 14th — can I get a couple of two-hour ones before then?",
    ],
  },
  {
    /*
     * The one with nothing in it.
     *
     * Every other demo is a business that has been running for a while, which
     * is the wrong thing to look at when judging what the first evening feels
     * like. This is a business created an hour ago: a name, a trade, a person,
     * and nothing else — so the guided set-up has everything still to do and
     * can be walked through as a new owner would walk it.
     */
    key: "fresh",
    name: "Brightwork Plastering (new demo)",
    slug: "brightwork-demo",
    vertical: "plasterer",
    email: "demo-fresh@second-pair.com",
    bare: true,
    settings: {
      travel_mode: "at_customer",
      deposit_mode: "none",
      takes_payments: false,
      payment_model: "business",
      vat_registered: false,
      notice_hours: 24,
      diary_colour: "category",
      // Deliberately unset: hours, prices, policy, privacy notice, FAQs.
      hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "09:00", close: "17:00", closed: true })),
      cancellation_policy: "",
      privacy_notice_url: null,
    },
    team: [["Kirsty Brightwell", "#5aa84f", "Plasterer", 0, 0]],
    clients: [],
    work: [],
    asks: [],
  },
];

// ─────────────────────────────────────────────────────────────── helpers

const wanted = process.argv[2];
const doing = wanted ? DEMOS.filter((d) => d.key === wanted) : DEMOS;
if (!doing.length) throw new Error(`No demo called "${wanted}". Try: ${DEMOS.map((d) => d.key).join(", ")}`);

const startOfWeek = () => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const at = (dayOffset, hour, minute = 0) => {
  const d = startOfWeek();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function upsert(table, match, row) {
  const { data: already } = await db.from(table).select("id").match(match).maybeSingle();
  if (already) {
    const { error } = await db.from(table).update(row).eq("id", already.id);
    if (error) throw new Error(`${table}: ${error.message}`);
    return already.id;
  }
  const { data, error } = await db.from(table).insert({ ...match, ...row }).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.id;
}

// ───────────────────────────────────────────────────────────────── build

for (const demo of doing) {
  console.log(`\n=== ${demo.name}`);

  const studioId = await upsert(
    "studios",
    { slug: demo.slug },
    {
      name: demo.name,
      vertical: demo.vertical,
      kind: "demo",
      timezone: "Europe/London",
      email: demo.email,
      hours: demo.settings.hours ?? weekdays("08:00", "17:30"),
      privacy_notice_url:
        demo.settings.privacy_notice_url === null ? null : "https://www.second-pair.com/privacy",
      ...demo.settings,
    },
  );
  console.log("  business:", studioId);

  /*
   * Seeded the way a real new business is: the trade's own services, words,
   * FAQs and reminders, from the pack rather than typed in here. That is the
   * whole point of these demos — if the pack is thin for a trade, it should
   * show up in the demo rather than be papered over.
   */
  {
    const { data: services } = await db
      .from("services")
      .select("id")
      .eq("studio_id", studioId)
      .limit(1);
    const { data: bands } = await db
      .from("price_bands")
      .select("id")
      .eq("studio_id", studioId)
      .limit(1);
    if (!services?.length && !bands?.length) {
      console.log("  seeding from the trade pack…");
      await seedFromPackViaApi(studioId, demo.vertical);
    }

    /*
     * And then the settings again, because seeding writes some of them.
     *
     * seedFromPack sets the trade's usual answers for deposits, where the work
     * happens and the words — right for a business being created, and it would
     * quietly undo what makes each of these demos different from the others.
     *
     * The new-business demo is seeded too: a business created in the back
     * office always gets its trade pack, so one without it would be a shape no
     * real owner ever sees. What makes it new is that nobody has filled
     * anything in — hours shut, no prices of their own, no policy, no Stripe.
     */
    const { error: settingsError } = await db
      .from("studios")
      .update({ ...demo.settings, hours: demo.settings.hours ?? weekdays("08:00", "17:30") })
      .eq("id", studioId);
    if (settingsError) throw new Error(settingsError.message);
  }

  // the team
  const team = [];
  for (const [name, colour, role, rate, minimum] of demo.team) {
    const id = await upsert(
      "artists",
      { studio_id: studioId, name },
      {
        colour,
        role,
        active: true,
        booking_provider: "native",
        hourly_rate_pence: rate,
        min_charge_pence: minimum,
      },
    );
    team.push({ id, name });
  }
  console.log("  team:", team.map((t) => t.name).join(", "));

  /*
   * A login, so the demo can actually be opened.
   *
   * One owner account per demo, linked to the first person on the team, the
   * same shape every real business has. The password is not used — the back
   * office signs in with a link — but the account has to exist to be signed
   * in as.
   */
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  let login = users.users.find((u) => u.email === demo.email);
  if (!login) {
    const { data: made, error } = await db.auth.admin.createUser({
      email: demo.email,
      email_confirm: true,
    });
    if (error) throw new Error(`${demo.email}: ${error.message}`);
    login = made.user;
  }

  await db
    .from("studio_members")
    .upsert({ studio_id: studioId, user_id: login.id, role: "owner" }, { onConflict: "studio_id,user_id" });

  if (team[0]) await db.from("artists").update({ user_id: login.id }).eq("id", team[0].id);
  console.log("  login:", demo.email);

  // the people they look after
  const clients = [];
  for (const [name, phone, note] of demo.clients) {
    const id = await upsert(
      "contacts",
      { studio_id: studioId, name },
      { phone, channel: "web", notes: note },
    );
    clients.push({ id, name });
  }

  if (demo.bare) {
    console.log("  left empty on purpose — this is the one for walking the set-up");
    continue;
  }

  /*
   * Where each job is, for a trade that drives to it.
   *
   * The report groups the week by postcode area, and a postcode only exists
   * on an enquiry — the assistant asks for it, and somebody typing a booking
   * into the diary does not. So the demo builds the same shape the assistant
   * would: a conversation, an enquiry with the address on it, and the jobs
   * hung off that.
   */
  const enquiries = new Map();
  const travels = demo.settings.travel_mode !== "at_premises";
  if (travels) {
    for (const [i, [name, , note, where]] of demo.clients.entries()) {
      // Either its own column, or a note that is plainly a postcode.
      const said = String(where ?? note ?? "").trim();
      const postcode = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(said) ? said : null;
      if (!postcode) continue;

      const client = clients.find((c) => c.name === name);
      if (!client) continue;

      const convId = await upsert(
        "conversations",
        { studio_id: studioId, external_ref: `demo-${demo.key}-job-${i}` },
        { channel: "web", status: "booked", contact_id: client.id, last_message_at: new Date().toISOString() },
      );
      const enquiryId = await upsert(
        "enquiries",
        { conversation_id: convId },
        { job_postcode: postcode, intent: "appointment" },
      );
      enquiries.set(client.id, enquiryId);
    }
    console.log("  addresses:", enquiries.size, "jobs with a postcode");
  }

  // this week, rebuilt
  const { data: mine } = await db.from("artists").select("id").eq("studio_id", studioId);
  const ids = (mine ?? []).map((a) => a.id);
  if (ids.length) {
    await db.from("bookings").delete().in("artist_id", ids).eq("source", "manual");
  }

  let made = 0;
  for (const [i, [title, minutes, pence]] of demo.work.entries()) {
    for (const dayOffset of [0, 1, 2, 3, 4]) {
      // Not every job every day: a diary with a perfect grid in it reads as fake.
      if ((i + dayOffset) % 3 === 0) continue;
      const person = team[(i + dayOffset) % team.length];
      const client = clients[(i * 3 + dayOffset) % clients.length];
      const starts = at(dayOffset, 8 + ((i * 2 + dayOffset) % 8), (i % 2) * 30);
      const ends = new Date(starts.getTime() + minutes * 60_000);

      /*
       * How long it really took, on the ones already done.
       *
       * Recorded when a job is closed off, and the report reads it back — so
       * without any the demo cannot show the one number an hourly trade wants.
       * A spread rather than a constant: some over, some under, most near.
       */
      const done = starts.getTime() < Date.now();
      const drift = [0, 15, -10, 30, 5, -5][(i + dayOffset) % 6];

      const { error } = await db.from("bookings").insert({
        artist_id: person.id,
        contact_id: client.id,
        enquiry_id: enquiries.get(client.id) ?? null,
        source: "manual",
        type: "session",
        category: "appointment",
        all_day: false,
        blocks_availability: true,
        title,
        price_pence: pence,
        deposit_amount_pence: 0,
        deposit_status: "paid",
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        repeats: "none",
        attended: done ? true : null,
        actual_minutes: done ? Math.max(15, minutes + drift) : null,
      });
      if (!error) made++;
    }
  }
  console.log("  diary:", made, "jobs this week");

  /*
   * A form the business needs signed before certain work, where the demo has
   * one. Built through the same tables the app writes, so the diary's "needs a
   * form" flag, the assistant's link and the client's record all behave
   * exactly as they would for a real business.
   */
  if (demo.form) {
    const blocks = demo.form.blocks.map((b, i) => ({ id: `b${i + 1}`, ...b }));
    const formId = await upsert(
      "form_templates",
      { studio_id: studioId, name: demo.form.name },
      { kind: demo.form.kind ?? "consent", blocks, active: true, sort_order: 0 },
    );

    const { data: theirServices } = await db
      .from("services")
      .select("id, name")
      .eq("studio_id", studioId);

    for (const service of theirServices ?? []) {
      const needs = demo.form.requiredFor.some((what) =>
        String(service.name).toLowerCase().includes(what.toLowerCase()),
      );
      await db
        .from("services")
        .update({ requires_form_id: needs ? formId : null })
        .eq("id", service.id);
    }

    // One signed, one still waiting, so both states are on the screen.
    const [signedFor, waitingFor] = clients;
    if (signedFor) {
      await upsert(
        "client_forms",
        { studio_id: studioId, contact_id: signedFor.id, template_id: formId },
        {
          title: demo.form.name,
          blocks,
          status: "signed",
          token: `demo-${demo.key}-signed-${signedFor.id.slice(0, 8)}`,
          signed_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
          signer_name: signedFor.name,
          answers: { b2: "Bramble", b3: "Cockapoo", b4: "2026-03-14" },
        },
      );
    }
    if (waitingFor) {
      await upsert(
        "client_forms",
        { studio_id: studioId, contact_id: waitingFor.id, template_id: formId },
        {
          title: demo.form.name,
          blocks,
          status: "sent",
          token: `demo-${demo.key}-sent-${waitingFor.id.slice(0, 8)}`,
          sent_via: "sms",
          expires_at: new Date(Date.now() + 25 * 86_400_000).toISOString(),
        },
      );
    }
    console.log("  form:", demo.form.name, "— required on", demo.form.requiredFor.join(" and "));
  }

  // a few enquiries, including one that needs a person
  for (const [i, said] of demo.asks.entries()) {
    const client = clients[i % clients.length];
    const convId = await upsert(
      "conversations",
      { studio_id: studioId, external_ref: `demo-${demo.key}-${i}` },
      {
        channel: i === 0 ? "web" : i === 1 ? "email" : "sms",
        status: i === 2 ? "needs_human" : "qualified",
        contact_id: client.id,
        last_message_at: new Date().toISOString(),
        ai_paused: i === 2,
      },
    );

    const { data: already } = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", convId)
      .limit(1);
    if (!already?.length) {
      await db.from("messages").insert([
        { conversation_id: convId, role: "client", content: said },
        {
          conversation_id: convId,
          role: "assistant",
          content:
            i === 2
              ? "Let me get somebody to answer that properly — they will come back to you shortly."
              : "Happy to help. I have got a few times that would work — shall I hold one for you?",
        },
      ]);
    }
  }
  console.log("  inbox:", demo.asks.length, "conversations");
}

/**
 * The trade pack, through the app rather than copied here.
 *
 * seedFromPack is TypeScript inside the app, and this is a plain script, so it
 * goes through the same admin endpoint the console uses. Where that is not
 * reachable — running this against a local database with no site up — the
 * demo is still made, just without the pack's services, and it says so.
 */
async function seedFromPackViaApi(studioId, vertical) {
  const site = env.NEXT_PUBLIC_SITE_URL ?? "https://www.second-pair.com";
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.log("  (no CRON_SECRET, so no pack seeding — services will be empty)");
    return;
  }
  const response = await fetch(`${site}/api/demo/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ studio: studioId, vertical }),
  }).catch(() => null);
  if (!response?.ok) {
    console.log("  (pack seeding did not run:", response ? await response.text() : "no answer", ")");
  }
}
