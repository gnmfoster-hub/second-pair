/**
 * Making the demo salon current again.
 *
 * The demo is seeded relative to the day it was built: a week of appointments
 * around this Monday, and an inbox timed in minutes-ago. Left alone for a
 * fortnight it becomes a business with an empty diary and a newest enquiry
 * from a week last Tuesday — which is worse than no demo, because the person
 * being shown it draws conclusions about the product from it.
 *
 * So this rebuilds both, and lives here rather than in the seeding script so
 * that the back office can run it too. Before this the only way to freshen the
 * demo was a terminal, a checkout and the service key, which meant in practice
 * it was refreshed when somebody happened to be at their desk rather than
 * before it was shown to somebody.
 *
 * It does not create anything: the studio, its people and its regulars are
 * built by scripts/demo-salon.mjs and left alone. This replaces what goes
 * stale.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export type DemoRefresh = {
  appointments: number;
  conversations: number;
  messages: number;
  /** Past visits built behind this week, so the salon has a memory. */
  history: number;
  /** Things sold over the counter, so the till has something in it. */
  sales: number;
};

/**
 * How often each regular comes, in days.
 *
 * Spread on purpose, because a good deal of the product is about the
 * difference between them. A demo where everybody comes every four weeks
 * cannot show a "who hasn't been back" list worth anything — that list is
 * measured against each person's own rhythm, and with one rhythm there is
 * nothing to measure. So: a fringe trim every three weeks, a colour every six,
 * a cut before Christmas and again before the summer.
 */
const RHYTHMS = [21, 28, 35, 42, 56, 70, 84, 120, 180];

/** What a regular usually has, so "the usual" has something to be. */
const USUAL: [string, number, number][] = [
  ["Cut and blow dry", 45, 4200],
  ["Colour and cut", 120, 9500],
  ["Roots", 75, 6500],
  ["Highlights", 150, 12000],
  ["Fringe trim", 15, 1000],
  ["Blow dry", 30, 2800],
  ["Balayage", 180, 15000],
];

/** What the shelf sells, for the counter sales. */
const SHELF: [string, number][] = [
  ["Shampoo, 250ml", 1450],
  ["Conditioner, 250ml", 1450],
  ["Heat protect spray", 1800],
  ["Gift voucher", 5000],
  ["Sea salt spray", 1600],
];

/*
 * Seven services and five answered questions.
 *
 * Without these the Inbox opens on "Your assistant is not ready yet" over a
 * blocking "No services are set up, so it cannot put a number on anything" —
 * the first thing anybody being shown this would read, and it says the product
 * does not work. A demo has to be a business that finished setting up, because
 * that is the thing being demonstrated.
 */
const SERVICES: [string, number, number, number][] = [
  ["Cut and blow dry", 0.75, 1.25, 0],
  ["Root touch-up", 1, 1.5, 1],
  ["Half head of foils", 2, 2.75, 2],
  ["Full head of highlights", 3, 4, 3],
  ["Balayage", 2.5, 3.5, 4],
  ["Gloss and toner", 0.5, 1, 5],
  ["Wedding hair", 2, 4, 6],
];

const FAQS: [string, string][] = [
  [
    "Do you do a patch test?",
    "Yes — for any colour we need a patch test at least 48 hours before. It takes two minutes and you can pop in any time we are open.",
  ],
  [
    "Where are you and is there parking?",
    "We are on Fore Street, and there is the long-stay car park behind us — about two minutes' walk.",
  ],
  [
    "What if I need to cancel?",
    "Just let us know 24 hours ahead and the deposit moves to your new appointment. Inside 24 hours we do have to keep it.",
  ],
  [
    "Do you take card?",
    "Card, cash or Apple Pay, all fine. The deposit is card only because it is paid before you come in.",
  ],
  [
    "Can I bring my little one?",
    "Of course. There is room for a pram by the window, and we would rather you came with them than not at all.",
  ],
];

/** The chair-work that fills the week. Minutes and pence. */
const WORK: [string, number, number][] = [
  ["Cut and finish", 60, 4500],
  ["Half head foils", 90, 7500],
  ["Blow dry", 45, 3000],
  ["Balayage", 150, 12000],
  ["Full head colour", 120, 9500],
  ["Restyle", 75, 5500],
  ["Fringe trim", 30, 1200],
  ["Toner", 45, 3500],
];

const ENQUIRERS: { name: string; phone: string }[] = [
  { name: "Hannah Beecham", phone: "+447700900311" },
  { name: "Leila Osman", phone: "+447700900312" },
  { name: "Fran Doyle", phone: "+447700900313" },
  { name: "Megan Attwood", phone: "+447700900314" },
  { name: "Sophie Laing", phone: "+447700900315" },
  { name: "Priya Ahmed", phone: "+447700900316" },
  { name: "Beth Corrigan", phone: "+447700900317" },
  { name: "Ivy Sandford", phone: "+447700900318" },
];

type Thread = {
  who: string;
  channel: string;
  status: string;
  /** Forces the opening message outside opening hours. Hour of last night. */
  openedLastNightAt?: [number, number];
  booking?: {
    artist: string;
    in: number;
    hour: number;
    minute: number;
    mins: number;
    price: number;
  };
  enquiry?: Record<string, unknown> & { artist?: string };
  messages: [number, string, string][];
};

/*
 * Written the way people actually type: no capital at the start, three
 * questions in one line, a change of mind halfway through. An inbox of tidy
 * sentences is the tell that nothing in it ever happened.
 */
const THREADS: Thread[] = [
  {
    who: "Hannah Beecham",
    channel: "whatsapp",
    status: "booked",
    // After closing, which is the whole argument: nobody was there and it
    // still took the booking and the deposit.
    openedLastNightAt: [21, 34],
    booking: { artist: "Sarah", in: 2, hour: 10, minute: 0, mins: 150, price: 12500 },
    enquiry: {
      intent: "appointment",
      description: "Half head of foils and a trim",
      quote_low_pence: 11000,
      quote_high_pence: 14500,
      artist: "Sarah",
      preferred_times: "Saturdays, or after 5 in the week",
    },
    messages: [
      [38, "client", "hiya do you do half head foils? and how much roughly"],
      [
        37,
        "assistant",
        "We do — a half head of foils with Sarah is £110 to £145 depending on your length and how much lift you are after, and that includes a trim and a finish. It runs about two and a half hours. Would you like me to look at some times?",
      ],
      [35, "client", "yes please, saturdays are best or after 5 in the week"],
      [
        34,
        "assistant",
        "Sarah has Saturday at 10:00, the Saturday after at 1:30, or Thursday at 5:15. Which suits?",
      ],
      [31, "client", "saturday at 10 is perfect"],
      [
        30,
        "assistant",
        "Booked in with Sarah, Saturday at 10:00. There is a £25 deposit to hold it, which comes off the price on the day — I have sent the link over. See you then.",
      ],
      [24, "client", "paid, thanks!"],
    ],
  },
  {
    who: "Leila Osman",
    channel: "web",
    status: "deposit_paid",
    booking: { artist: "Nadia", in: 3, hour: 10, minute: 0, mins: 180, price: 14000 },
    enquiry: {
      intent: "appointment",
      description: "Balayage, mid-length, box dye to lift",
      quote_low_pence: 12000,
      quote_high_pence: 16000,
      artist: "Nadia",
      preferred_times: "weekday mornings",
    },
    messages: [
      [
        96,
        "client",
        "im after balayage, my hair is mid length and box dyed dark about a year ago. is that going to be a problem",
      ],
      [
        95,
        "assistant",
        "Not a problem, it just means we go gently — box colour lifts unevenly, so Nadia would take it lighter across the appointment rather than force it in one go. Balayage with her is £120 to £160 depending on length and how much lift, about three hours. She would rather see it before promising a shade.",
      ],
      [93, "client", "that makes sense. weekday mornings are easiest for me"],
      [
        92,
        "assistant",
        "Nadia has Tuesday at 9:30, Wednesday at 10:00 or Friday at 9:00. Any of those?",
      ],
      [88, "client", "wednesday 10 please"],
      [
        87,
        "assistant",
        "That is yours — Wednesday at 10:00 with Nadia, about three hours. £25 deposit to hold it and it comes off on the day.",
      ],
    ],
  },
  {
    who: "Fran Doyle",
    channel: "instagram",
    status: "qualified",
    enquiry: {
      intent: "consultation",
      description: "Wedding hair for six, July next year",
      quote_low_pence: 45000,
      quote_high_pence: 60000,
      artist: "Sarah",
      preferred_times: "trial first, afternoons",
    },
    messages: [
      [
        14,
        "client",
        "hello! getting married next july and looking for someone for me and 5 bridesmaids, do you do that and do you come to us",
      ],
      [
        13,
        "assistant",
        "Congratulations — yes, we do weddings, and we can come to you within about twenty miles. For six of you it is usually £450 to £600 depending on how much is up and how early the start is, and we would want a trial with you first. July is a way off so there is plenty of room. Shall I have Sarah ring you to talk it through?",
      ],
      [11, "client", "yes please, afternoons are best"],
      [
        10,
        "assistant",
        "I have asked Sarah to call you this afternoon. She has done a fair few weddings and will be able to say more about the trial than I can.",
      ],
    ],
  },
  {
    who: "Megan Attwood",
    channel: "sms",
    status: "needs_human",
    messages: [
      [
        52,
        "client",
        "i was in on saturday for a colour and honestly im not happy with it, its gone a lot more orange than we talked about",
      ],
      [
        51,
        "assistant",
        "I am sorry — that is not what you came in for, and I would rather someone here sorted it than me. I have passed this straight to Sarah with your name and what you have said, and she will come back to you today.",
      ],
    ],
  },
  {
    who: "Sophie Laing",
    channel: "web",
    status: "new",
    messages: [
      [3, "client", "do you have anything this week for a cut and blow dry?"],
      [
        2,
        "assistant",
        "We do — Chloe has Thursday at 2:00 or Friday at 11:30, and Mo has Friday at 4:45. A cut and blow dry is £42 and takes about an hour. Which would you like?",
      ],
    ],
  },
  {
    who: "Priya Ahmed",
    channel: "whatsapp",
    status: "qualified",
    enquiry: { intent: "question", description: "Keratin — not something we do" },
    messages: [
      [8, "client", "do you do keratin treatments?"],
      [
        8,
        "assistant",
        "We do not, I am afraid — that is the one thing we have never taken on. If it is the frizz you are after, Nadia does a gloss and a cut that gets a good way there for £55, but I would rather say so than book you in for the wrong thing.",
      ],
      [6, "client", "appreciate that, ill have a think"],
    ],
  },
  {
    who: "Beth Corrigan",
    channel: "web",
    status: "booked",
    booking: { artist: "Mo", in: 1, hour: 11, minute: 15, mins: 75, price: 5500 },
    enquiry: {
      intent: "appointment",
      description: "Root touch-up and blow dry",
      quote_low_pence: 5500,
      quote_high_pence: 5500,
      artist: "Mo",
    },
    messages: [
      [260, "client", "roots are awful, anything today or tomorrow??"],
      [
        259,
        "assistant",
        "Mo can do a root touch-up tomorrow at 11:15 or 3:30 — it is £55 with a blow dry and takes about an hour and a quarter. Shall I put you down?",
      ],
      [256, "client", "11.15 amazing thank you"],
      [255, "assistant", "Done — tomorrow at 11:15 with Mo. See you then."],
    ],
  },
  {
    who: "Ivy Sandford",
    channel: "instagram",
    status: "lost",
    messages: [
      [2600, "client", "how much for a full head of highlights"],
      [
        2599,
        "assistant",
        "A full head with Sarah or Nadia is £145 to £185 depending on length and lift, about three and a half hours, and that includes a trim and a finish. Would you like to see some times?",
      ],
      [2520, "client", "bit more than i wanted to spend, thanks anyway"],
      [
        2519,
        "assistant",
        "No problem at all — if a half head would do, that is £110 to £145. Either way, we are here.",
      ],
    ],
  },
];

/**
 * Rebuild the demo salon's week and inbox.
 *
 * Refuses anything that is not kind = demo. This deletes appointments and
 * conversations wholesale, so the check is made here against the row rather
 * than trusted from the caller — the caller is a button, and a button is one
 * wrong id away from doing that to a real business.
 */
export async function refreshDemo(db: Db, studioId: string): Promise<DemoRefresh> {
  const { data: studio } = await db
    .from("studios")
    .select("id, kind, name")
    .eq("id", studioId)
    .maybeSingle();

  if (!studio) throw new Error("That business is not here any more.");
  if (studio.kind !== "demo") {
    throw new Error(`${studio.name} is not a demo, so there is nothing here to rebuild.`);
  }

  const { data: team } = await db
    .from("artists")
    .select("id, name")
    .eq("studio_id", studio.id)
    .order("created_at");

  const roster = team ?? [];
  if (roster.length === 0) throw new Error("The demo has no people in it.");
  const person = (name: string) => roster.find((a) => a.name === name) ?? roster[0];

  // ------------------------------------------------------------- set up
  for (const [size_label, hours_low, hours_high, sort_order] of SERVICES) {
    await db
      .from("price_bands")
      .upsert(
        { studio_id: studio.id, size_label, hours_low, hours_high, sort_order },
        { onConflict: "studio_id,size_label" },
      );
  }

  for (const [i, [question, answer]] of FAQS.entries()) {
    const { data: had } = await db
      .from("faqs")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("question", question)
      .maybeSingle();

    if (had) await db.from("faqs").update({ answer, sort_order: i }).eq("id", had.id);
    else await db.from("faqs").insert({ studio_id: studio.id, question, answer, sort_order: i });
  }

  // -------------------------------------------------------- the regulars
  const { data: regulars } = await db
    .from("contacts")
    .select("id, name")
    .eq("studio_id", studio.id)
    .limit(40);

  /*
   * Named people only.
   *
   * The demo accumulates contacts with no name — somebody opening the widget
   * on the live site and typing nothing is a real contact row with a null
   * name, and there are five of them. Given a year of history and a place on
   * the "who hasn't been back" list they turn into "Somebody, last in four
   * months ago", which reads as a bug in a screen whose whole job is to be
   * read as trustworthy.
   */
  const clients = (regulars ?? []).filter((c) => (c.name ?? "").trim().length > 0);

  /*
   * Who has stopped coming, settled before anything is built.
   *
   * A lapsed client is an absence, and an absence has to be arranged for: it
   * is not enough to leave them out of the history, they also have to be left
   * out of this week, or their last visit is Tuesday and they are not lapsed
   * at all. That is exactly how the first version of this produced a "who
   * hasn't been back" list with nobody on it — the history said gone four
   * months, the week said in on Tuesday, and the week was right.
   *
   * Decided here, once, so the two halves cannot disagree.
   */
  const lapsedIds = new Set(clients.filter((_, i) => i % 7 === 3).map((c) => c.id));
  const stillComing = clients.filter((c) => !lapsedIds.has(c.id));

  // ---------------------------------------------------------- the week
  /*
   * Only this studio's own appointments, reached through its own people.
   * There is no studio_id on a booking, and this is the one place it matters:
   * getting it wrong here would empty somebody's real diary.
   */
  for (const who of roster) await db.from("bookings").delete().eq("artist_id", who.id);

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const at = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  let n = 0;
  let appointments = 0;

  for (let day = 0; day < 6; day++) {
    const busy = [0.45, 0.7, 0.9, 0.85, 0.95, 1][day];

    for (const [who, stylist] of roster.entries()) {
      // The apprentice works fewer days, which is what an apprentice does.
      if (who === 4 && day % 2 === 1) continue;

      let minute = 9 * 60 + (who % 2 ? 30 : 0);

      while (minute < 17 * 60) {
        n++;
        const [title, mins, price] = WORK[n % WORK.length];

        // A gap where the pattern says quiet, so the day is not a solid wall.
        if ((n * 7 + day * 3 + who) % 10 > busy * 10) {
          minute += 30;
          continue;
        }

        if (minute + mins > 17 * 60 + 30) break;

        const starts = at(day, Math.floor(minute / 60), minute % 60);
        /*
         * The error is read, which it was not before.
         *
         * Every insert in this loop was fired and forgotten, and `appointments`
         * counted the attempt rather than the row. So a quarter of them were
         * being refused by a check constraint while the back office reported a
         * successful rebuild with a number in it — the one kind of failure
         * nobody goes looking for, because the screen says it worked.
         */
        const { error: bookingError } = await db.from("bookings").insert({
          artist_id: stylist.id,
          // Anybody marked as having stopped coming is not in this week.
          contact_id: stillComing.length ? stillComing[n % stillComing.length].id : null,
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + mins * 60_000).toISOString(),
          type: "session",
          title,
          /*
           * Every one of these is typed in by hand, and that is not a
           * compromise — it is the truth about a salon's week and it is what
           * makes the takings figure mean anything.
           *
           * This line used to make every fourth one 'assistant', to show the
           * product's own work in the diary. It never once worked: an
           * assistant booking must carry the enquiry that made it, the
           * constraint says so, and none of these had one — so a quarter of
           * the demo's week was rejected by the database on every rebuild,
           * counted as inserted anyway because nothing checked, and reported
           * back as a number that had never been true.
           *
           * The assistant's own bookings are further down, made out of the
           * conversations in the inbox, which is where they can be real.
           */
          source: "manual",
          price_pence: price,
          deposit_amount_pence: 0,
          blocks_availability: true,
        });

        if (bookingError) {
          throw new Error(`Could not build the demo's week: ${bookingError.message}`);
        }
        appointments++;

        /*
         * Back onto the quarter hour.
         *
         * Adding the length and a fifteen minute gap to a thirty minute fringe
         * trim gave 9:35, 10:50, 12:05 — times no salon has ever written down.
         * A demo is read as a sample of what the product produces, so its
         * appointments have to start when appointments start.
         */
        minute = Math.ceil((minute + mins + 15) / 15) * 15;
      }
    }

    // Lunch for the two seniors, so the grid has non-appointment entries in it.
    for (const who of [0, 2]) {
      if (!roster[who]) continue;
      const starts = at(day, 13, who === 0 ? 0 : 30);
      await db.from("bookings").insert({
        artist_id: roster[who].id,
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + 45 * 60_000).toISOString(),
        type: "session",
        title: "Lunch",
        category: "break",
        source: "manual",
        deposit_amount_pence: 0,
        blocks_availability: true,
      });
      appointments++;
    }
  }

  // A day off next week, so time off shows somewhere.
  if (roster[3]) {
    await db.from("bookings").insert({
      artist_id: roster[3].id,
      starts_at: at(8, 9, 0).toISOString(),
      ends_at: at(8, 17, 0).toISOString(),
      type: "session",
      title: "Holiday",
      category: "holiday",
      source: "manual",
      all_day: true,
      deposit_amount_pence: 0,
      blocks_availability: true,
    });
    appointments++;
  }

  // --------------------------------------------------- money switched on
  /*
   * A demo of a product about money with the money switched off.
   *
   * The salon sat at deposit_mode 'none' and takes_payments false while its
   * own assistant bookings said "deposit paid" on them — which is not a
   * demonstration of anything, it is two halves of a screen disagreeing in
   * front of whoever is being shown it. Everything downstream was off with it:
   * the payment panel on an appointment, the ask-for-payment control on four
   * screens, the deposit line on a quote.
   *
   * On, and set to what a salon actually does: a deposit asked for rather than
   * demanded, because most of them take a card number for a colour and not for
   * a fringe trim.
   */
  await db
    .from("studios")
    // Fallback on, so one Stripe connected by the owner shows checkout for everyone,
    // while a stylist who connects their own still shows the money going to them.
    .update({ deposit_mode: "optional", takes_payments: true, payment_fallback: true })
    .eq("id", studio.id);

  await ensureDemoPriceList(db, studio.id);

  // ------------------------------------------------------- the shelf
  /*
   * Things the shop itself sells, as against one person's own.
   *
   * The demo's two products both belonged to the nail technician, which is a
   * real arrangement and the wrong one to have only. A product owned by one
   * person is on that person's appointments and nobody else's — so five of the
   * six chairs had an empty shelf, and the thing being demonstrated is the
   * bottle sold at the end of a colour.
   */
  try {
    for (const [i, [name, price_pence]] of SHELF.slice(0, 3).entries()) {
      const { data: had } = await db
        .from("services")
        .select("id")
        .eq("studio_id", studio.id)
        .eq("name", name)
        .is("artist_id", null)
        .maybeSingle();

      if (had) {
        await db.from("services").update({ price_pence, active: true }).eq("id", had.id);
      } else {
        await db.from("services").insert({
          studio_id: studio.id,
          name,
          kind: "product",
          minutes: null,
          price_pence,
          // A bottle is not an appointment, so it is not something to book.
          bookable_online: false,
          active: true,
          sort_order: 200 + i,
        });
      }
    }
  } catch {
    // A shelf of one person's own products is still a shelf.
  }

  /*
   * How many of each are on the shelf.
   *
   * Empty is the honest default for a real business — most do not count four
   * bottles — and a demo of "it tells you what is running out" with nothing
   * counted demonstrates nothing. One is deliberately left at two, so the
   * nearly-out case is visible rather than described.
   *
   * Guarded and swallowed: this is the newest thing in the product and a demo
   * rebuild is not where a missing migration should first be discovered.
   */
  try {
    const { data: shelf } = await db
      .from("services")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("kind", "product");

    for (const [i, item] of (shelf ?? []).entries()) {
      await db
        .from("services")
        .update({ stock: [2, 11, 7, 4, 9][i % 5] })
        .eq("id", item.id);
    }
  } catch {
    // A demo with an uncounted shelf is still a demo.
  }

  // --------------------------------------------------- who does what
  /*
   * The apprentice does not do colour, and the nail technician does no hair.
   *
   * True of every salon and invisible in a demo without it: a price list where
   * everybody does everything is the one shape a real shop never has, and the
   * thing the assistant most needs to get right — offering the person who can
   * actually do the work — cannot be shown at all.
   *
   * Guarded and swallowed, like the shelf above it.
   */
  try {
    const { data: hair } = await db
      .from("services")
      .select("id, name")
      .eq("studio_id", studio.id)
      .eq("kind", "service")
      .is("artist_id", null);

    const colour = ["Half head of foils", "Full head of highlights", "Balayage", "Wedding hair"];
    const jade = roster.find((a) => a.name === "Jade");
    const aisha = roster.find((a) => a.name === "Aisha");

    for (const service of hair ?? []) {
      const off: string[] = [];
      // An apprentice cuts and blow dries; she is not let loose on a colour.
      if (jade && colour.includes(service.name as string)) off.push(jade.id);
      // And a nail technician does none of the hair at all.
      if (aisha) off.push(aisha.id);

      for (const artistId of off) {
        await db.from("service_people").upsert(
          { service_id: service.id, artist_id: artistId, minutes: null, price_pence: null, offered: false },
          { onConflict: "service_id,artist_id" },
        );
      }
    }
  } catch {
    // A demo where everybody does everything is still a demo.
  }

  // ------------------------------------------------------- the memory
  const { history, sales } = await buildHistory(db, studio.id, clients, lapsedIds, roster, monday);

  // --------------------------------------------------------- the inbox
  const contacts: Record<string, string> = {};
  for (const c of ENQUIRERS) {
    const { data: had } = await db
      .from("contacts")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("phone", c.phone)
      .maybeSingle();

    if (had) {
      await db.from("contacts").update({ name: c.name }).eq("id", had.id);
      contacts[c.name] = had.id;
      continue;
    }

    const { data } = await db
      .from("contacts")
      .insert({ studio_id: studio.id, name: c.name, phone: c.phone })
      .select("id")
      .single();
    if (data) contacts[c.name] = data.id;
  }

  // Start clean, or a refresh stacks eight more threads on the last set.
  const { data: old } = await db.from("conversations").select("id").eq("studio_id", studio.id);
  for (const c of old ?? []) await db.from("conversations").delete().eq("id", c.id);

  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();

  /*
   * Last night, for the one that came in after closing.
   *
   * "Won while you were busy" counts only what arrived outside opening hours,
   * so with every thread timed in minutes-ago it read £0 whenever the demo was
   * opened during the day — the one figure that answers "is this worth paying
   * for", showing nothing, in the middle of a demonstration.
   */
  const lastNight = (hour: number, minute: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const onDay = (offset: number, hour: number, minute: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  let conversations = 0;
  let messages = 0;

  for (const t of THREADS) {
    const opened = t.messages[0][0];
    const latest = t.messages[t.messages.length - 1][0];

    const { data: conv } = await db
      .from("conversations")
      .insert({
        studio_id: studio.id,
        contact_id: contacts[t.who],
        channel: t.channel,
        status: t.status,
        // The number the report reads for "answered in under a minute".
        first_response_ms: 22_000 + ((conversations * 7919) % 34_000),
        last_message_at: ago(latest),
        created_at: t.openedLastNightAt
          ? lastNight(t.openedLastNightAt[0], t.openedLastNightAt[1])
          : ago(opened),
      })
      .select("id")
      .single();

    if (!conv) continue;

    for (const [mins, role, content] of t.messages) {
      await db
        .from("messages")
        .insert({ conversation_id: conv.id, role, content, created_at: ago(mins) });
      messages++;
    }

    if (t.enquiry) {
      const { artist, ...rest } = t.enquiry;
      const { data: enq } = await db
        .from("enquiries")
        .insert({
          conversation_id: conv.id,
          ...rest,
          artist_id: artist ? person(artist).id : null,
        })
        .select("id")
        .single();

      /*
       * The appointment the conversation turned into.
       *
       * Without it the Inbox reads "0 booked in" and "£0 won" over a list of
       * threads plainly marked Booked — the sort of contradiction a person
       * notices in a demo and cannot unsee. The figures count conversations
       * whose enquiry has a booking, so the two have to be joined up rather
       * than merely both present.
       */
      if (enq && t.booking) {
        const b = t.booking;
        const starts = onDay(b.in, b.hour, b.minute);
        const ends = new Date(starts.getTime() + b.mins * 60_000);

        // Clear the chair. The made-up week gives way to the booking that has
        // a conversation behind it, because that is what the demo is about.
        const { data: clash } = await db
          .from("bookings")
          .select("id")
          .eq("artist_id", person(b.artist).id)
          .is("cancelled_at", null)
          .lt("starts_at", ends.toISOString())
          .gt("ends_at", starts.toISOString());
        for (const c of clash ?? []) await db.from("bookings").delete().eq("id", c.id);

        await db.from("bookings").insert({
          enquiry_id: enq.id,
          artist_id: person(b.artist).id,
          contact_id: contacts[t.who],
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          type: "session",
          title: String(t.enquiry.description ?? "Appointment"),
          source: "assistant",
          price_pence: b.price,
          deposit_amount_pence: 2500,
          deposit_status: "paid",
          blocks_availability: true,
        });
        appointments++;
      }
    }

    conversations++;
  }

  /*
   * The states a week has in it that a generated week never does.
   *
   * Everything above builds a salon where nothing has gone wrong: nobody
   * cancels, nobody is off sick, nothing is ever refunded, and nobody buys a
   * bottle on their way out. Those are the screens somebody testing wants to
   * see most, because they are the ones that are hard to reach by hand — you
   * cannot demonstrate a cancellation list without a cancellation.
   *
   * Each of these is guarded on its own. They are independent of one another
   * and none of them is worth failing a rebuild over.
   */
  await buildTheAwkwardBits(db, studio.id, roster, monday, at);

  return { appointments, conversations, messages, history, sales };
}

/**
 * Cancellations, time off, a refund, and a bottle sold at the chair.
 *
 * Grouped rather than scattered through the builder above, because they have
 * one thing in common: every one of them is a state the product handles and
 * the demo could not show. Somebody testing the cancellation flow had to
 * cancel something first, which meant the thing they were testing had already
 * happened by the time they got to it.
 */
async function buildTheAwkwardBits(
  db: Db,
  studioId: string,
  roster: { id: string; name: string }[],
  monday: Date,
  at: (dayOffset: number, hour: number, minute?: number) => Date,
): Promise<void> {
  // ------------------------------------------------------ somebody cancels
  /*
   * Two, late in the week, from two different people.
   *
   * Cancelled rather than deleted: a cancellation is a thing that happened and
   * the slot it leaves is what the "we have had a cancellation" offer is made
   * out of. Deleting it would leave a gap in the diary that looks like nobody
   * was ever booked, which is the opposite of the point.
   */
  try {
    const { data: soon } = await db
      .from("bookings")
      .select("id")
      .in("artist_id", roster.map((r) => r.id))
      .is("cancelled_at", null)
      .eq("category", "appointment")
      .gte("starts_at", at(3, 0).toISOString())
      .lte("starts_at", at(5, 23).toISOString())
      .limit(2);

    for (const b of soon ?? []) {
      await db
        .from("bookings")
        .update({
          cancelled_at: new Date(monday.getTime() - 2 * 86_400_000).toISOString(),
          blocks_availability: false,
        })
        .eq("id", b.id);
    }
  } catch {
    // A demo where nobody cancels is still a demo.
  }

  // --------------------------------------------------------- and time off
  /*
   * A fortnight booked off in a month, on the column rather than as a
   * booking in the diary.
   *
   * The two are different and both exist: the holiday further up is an entry
   * somebody can see in the week, and this is the thing the assistant reads
   * when deciding whether to offer a Tuesday in three weeks. Nobody had a
   * single day on it, so the half that stops a customer being offered a slot
   * during somebody's holiday has never been exercised.
   */
  try {
    const off = new Date(monday.getTime() + 28 * 86_400_000);
    const back = new Date(off.getTime() + 13 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const sarah = roster.find((r) => r.name === "Sarah");

    if (sarah) {
      await db
        .from("artists")
        .update({ time_off: [{ from: iso(off), to: iso(back), reason: "Holiday" }] })
        .eq("id", sarah.id);
    }
  } catch {
    // Nobody goes on holiday in the demo, then.
  }

  // ------------------------------------------------------------ a refund
  /*
   * One sale given back, so the refunded state exists somewhere.
   *
   * It shows in three places that are otherwise unreachable without doing it
   * for real in Stripe: the badge on the client's record, the payment left out
   * of their total, and the refund line in the week's takings.
   */
  try {
    const { data: one } = await db
      .from("payments")
      .select("id")
      .eq("studio_id", studioId)
      .eq("kind", "product")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (one) {
      await db
        .from("payments")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", one.id);
    }
  } catch {
    // Nothing came back this month.
  }

  // ------------------------------------------ somebody we can actually write to
  /*
   * Two clients with an address on them, and the rest deliberately without.
   *
   * Not one contact in the demo had an email. Which meant the entire written
   * half of the product could not be demonstrated or tested on it: no booking
   * confirmation, no receipt, no emailing a client from their record — every
   * one of them returning quietly because there was nowhere to send it, which
   * is correct behaviour and looks exactly like a feature that does not work.
   *
   * The business's own demo address, so anything sent lands somewhere that is
   * ours to read and nothing is ever sent to a stranger. Change it on the
   * client's record to your own if you want it in your pocket.
   *
   * Only two, on purpose. A client with no address is a real and common state
   * — half a salon's book is a phone number and a name — and the screens that
   * have to cope with it are worth seeing cope with it.
   */
  try {
    const { data: named } = await db
      .from("contacts")
      .select("id")
      .eq("studio_id", studioId)
      .not("name", "is", null)
      .order("created_at")
      .limit(2);

    for (const c of named ?? []) {
      await db.from("contacts").update({ email: "demo@second-pair.com" }).eq("id", c.id);
    }
  } catch {
    // Nobody to write to, then.
  }

  // -------------------------------------- a bottle sold at the chair itself
  /*
   * One sale tied to the appointment it happened at, rather than to the day.
   *
   * Every other sale in here is a counter sale with no booking behind it,
   * which is what the till makes. This is what the appointment makes — and it
   * is the half that shows on the appointment when you reopen it, and the half
   * that answers "she had a colour and bought the silver shampoo" six weeks
   * later. Without one, the panel on the appointment always reads as though
   * nothing has ever been sold there.
   */
  try {
    const { data: recent } = await db
      .from("bookings")
      .select("id, artist_id, contact_id")
      .in("artist_id", roster.map((r) => r.id))
      .is("cancelled_at", null)
      .not("contact_id", "is", null)
      .eq("category", "appointment")
      .lt("starts_at", monday.toISOString())
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      const [name, pence] = SHELF[0];
      const { data: sale } = await db
        .from("payments")
        .insert({
          studio_id: studioId,
          artist_id: recent.artist_id,
          contact_id: recent.contact_id,
          booking_id: recent.id,
          kind: "product",
          gross_pence: pence,
          status: "paid",
          method: "card",
          description: name,
          paid_at: new Date(monday.getTime() - 86_400_000).toISOString(),
        })
        .select("id")
        .single();

      if (sale) {
        await db
          .from("payment_items")
          .insert({ payment_id: sale.id, name, quantity: 1, unit_pence: pence, sort_order: 0 });
      }
    }
  } catch {
    // Nobody bought anything on the way out, then.
  }
}

/**
 * Ten months of the salon's past, behind this week.
 *
 * The demo had exactly one week in it, and a week is not a business. Everything
 * the product knows about a person is built out of their history — who they
 * usually see, what they usually have, how long they really take, whether they
 * have quietly stopped coming — so with seven days of appointments every one of
 * those screens was empty or said "first visit", and the demo could not show
 * the half of the product that is worth the most.
 *
 * Each regular gets a rhythm, a usual, and a usual stylist, and then comes in
 * on that rhythm all the way back. Which means the client record has a real
 * history on it, "usually with" has an answer, and the takings have something
 * behind them.
 *
 * Three of them are stopped early, deliberately. A demo of "who hasn't been
 * back" with nobody on the list demonstrates nothing at all, and lapsed
 * clients are not a thing you can add later — they are an absence, and an
 * absence has to be built in.
 */
async function buildHistory(
  db: Db,
  studioId: string,
  clients: { id: string }[],
  /** Who has stopped coming. Decided by the caller, so this week agrees. */
  lapsedIds: Set<string>,
  roster: { id: string; name: string }[],
  monday: Date,
): Promise<{ history: number; sales: number }> {
  if (clients.length === 0 || roster.length === 0) return { history: 0, sales: 0 };

  const DAY = 86_400_000;

  /*
   * Which day each visit falls on, before any time is decided.
   *
   * The two halves are separate on purpose. The day comes from the client's
   * rhythm, which is the thing being modelled; the time comes from what else
   * that stylist already has on, which is a constraint rather than a choice.
   * Deciding both at once is what produced two customers in one chair at half
   * past two — the database refused it, correctly, and the whole rebuild
   * failed.
   */
  type Planned = {
    artistId: string;
    contactId: string;
    /** Midnight on the day, local. */
    day: number;
    title: string;
    mins: number;
    price: number;
    attended: boolean;
  };

  const planned: Planned[] = [];

  clients.forEach((client, i) => {
    const rhythm = RHYTHMS[i % RHYTHMS.length];
    const [title, mins, price] = USUAL[i % USUAL.length];
    // Their usual stylist, so "usually with" is a real answer rather than
    // whoever happened to be free the day the demo was built.
    const stylist = roster[i % roster.length];

    /*
     * Some of them stopped coming, chosen by the caller so that this week and
     * this history tell the same story. Spread across different rhythms, so
     * the lapsed list is not simply "the ones who come least often" — the
     * thing being demonstrated is that a five-week client gone three months
     * outranks a twice-a-year client gone seven.
     */
    const stoppedDaysAgo = lapsedIds.has(client.id) ? rhythm * 3 : 0;

    for (let visit = 1; visit <= 12; visit++) {
      const daysBack = stoppedDaysAgo + visit * rhythm;
      if (daysBack > 300) break;

      /*
       * A little scatter, because nobody comes back on exactly the same
       * interval, and a median taken from identical gaps is a suspiciously
       * tidy number on a screen meant to look like a real salon.
       */
      const jitter = ((i * 7 + visit * 13) % 7) - 3;
      const when = new Date(monday.getTime() - (daysBack + jitter) * DAY);
      when.setHours(0, 0, 0, 0);

      // Nobody comes in on a Sunday.
      if (when.getDay() === 0) when.setDate(when.getDate() - 1);

      planned.push({
        artistId: stylist.id,
        contactId: client.id,
        day: when.getTime(),
        title,
        mins,
        price,
        /*
         * Closed off, which is what an appointment from March looks like.
         * Left null they would all sit in the diary as unanswered "did they
         * come?" prompts stretching back ten months.
         */
        attended: (i + visit) % 11 !== 0,
      });
    }
  });

  /*
   * Now the times, one stylist's day at a time.
   *
   * Laid out end to end from nine with a quarter of an hour between, which is
   * how a chair actually fills up, and guarantees the thing the database
   * insists on: no two appointments in one person's diary at once.
   */
  const rows: Record<string, unknown>[] = [];
  const days = new Map<string, Planned[]>();

  for (const p of planned) {
    const key = `${p.artistId}:${p.day}`;
    days.set(key, [...(days.get(key) ?? []), p]);
  }

  for (const sameDay of days.values()) {
    let minute = 9 * 60;

    for (const p of sameDay) {
      // A chair that is full is full. Anybody left over simply did not come
      // that day, which is more honest than stacking them on top of a colleague.
      if (minute + p.mins > 18 * 60) break;

      const starts = new Date(p.day);
      starts.setHours(Math.floor(minute / 60), minute % 60, 0, 0);

      rows.push({
        artist_id: p.artistId,
        contact_id: p.contactId,
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + p.mins * 60_000).toISOString(),
        type: "session",
        title: p.title,
        // Manual, necessarily: an assistant booking has to carry the enquiry
        // that made it, and a visit from March has no conversation behind it.
        source: "manual",
        price_pence: p.price,
        deposit_amount_pence: 0,
        blocks_availability: true,
        attended: p.attended,
      });

      minute = Math.ceil((minute + p.mins + 15) / 15) * 15;
    }
  }

  // One statement rather than three hundred round trips.
  const { error } = await db.from("bookings").insert(rows);
  if (error) throw new Error(`Could not build the demo's history: ${error.message}`);

  return { history: rows.length, sales: await buildSales(db, studioId, clients, roster, monday) };
}

/**
 * A few weeks of things sold over the counter.
 *
 * Without these the till, the counter line in the report and the Bought
 * section on a client's record are all empty — three screens that look broken
 * rather than new. A salon sells a bottle most days, so the demo should too.
 *
 * Guarded rather than allowed to fail the whole refresh: this is the newest
 * table in the product and a demo rebuild is not the place to discover that a
 * migration has not been run somewhere.
 */
async function buildSales(
  db: Db,
  studioId: string,
  clients: { id: string }[],
  roster: { id: string; name: string }[],
  monday: Date,
): Promise<number> {
  const DAY = 86_400_000;

  try {
    await db.from("payments").delete().eq("studio_id", studioId).eq("kind", "product");

    const made: { id: string; lines: { name: string; pence: number; qty: number }[] }[] = [];

    for (let i = 0; i < 18; i++) {
      const when = new Date(monday.getTime() - (i * 2 + 1) * DAY);
      when.setHours(11 + (i % 6), (i % 4) * 15, 0, 0);

      // Two things in the sale now and then, which is what a sale looks like.
      const lines = [
        { ...shelfItem(i), qty: i % 5 === 0 ? 2 : 1 },
        ...(i % 3 === 0 ? [{ ...shelfItem(i + 2), qty: 1 }] : []),
      ];
      const total = lines.reduce((sum, l) => sum + l.pence * l.qty, 0);

      const { data } = await db
        .from("payments")
        .insert({
          studio_id: studioId,
          artist_id: roster[i % roster.length].id,
          contact_id: clients[i % clients.length]?.id ?? null,
          kind: "product",
          gross_pence: total,
          status: "paid",
          method: i % 3 === 0 ? "cash" : "card",
          description: lines
            .map((l) => (l.qty > 1 ? `${l.qty} × ${l.name}` : l.name))
            .join(", "),
          paid_at: when.toISOString(),
        })
        .select("id")
        .single();

      if (data) made.push({ id: data.id, lines });
    }

    const items = made.flatMap((sale) =>
      sale.lines.map((l, order) => ({
        payment_id: sale.id,
        name: l.name,
        quantity: l.qty,
        unit_pence: l.pence,
        sort_order: order,
      })),
    );

    if (items.length) await db.from("payment_items").insert(items);

    return made.length;
  } catch {
    // A demo without a till is still a demo. Nothing else here depends on it.
    return 0;
  }
}

function shelfItem(i: number): { name: string; pence: number } {
  const [name, pence] = SHELF[i % SHELF.length];
  return { name, pence };
}

/**
 * Every name the demo books is on its price list.
 *
 * The diary was filled from its own list of work — "Full head colour",
 * "Restyle", "Toner" — which was never on the salon's price list, so nothing
 * on the demo's diary was a real service: Complete could not pick what they
 * had, "the usual" had nothing to point at, and a form needed before a colour
 * could never be asked for. Adding the missing names makes the demo behave
 * like a salon that set itself up properly. Nothing already there is changed.
 */
export async function ensureDemoPriceList(db: Db, studioId: string): Promise<number> {
  const { data: existing } = await db.from("services").select("name").eq("studio_id", studioId);
  const have = new Set((existing ?? []).map((r) => String(r.name).trim().toLowerCase()));
  const wanted = new Map<string, [number, number]>();
  for (const [name, minutes, pence] of [...WORK, ...USUAL]) {
    if (!wanted.has(name)) wanted.set(name, [minutes, pence]);
  }
  const rows = [...wanted.entries()]
    .filter(([name]) => !have.has(name.toLowerCase()))
    .map(([name, [minutes, pence]], i) => ({
      studio_id: studioId,
      name,
      kind: "service",
      minutes,
      price_pence: pence,
      sort_order: 100 + i,
    }));
  if (!rows.length) return 0;
  const { error } = await db.from("services").insert(rows);
  return error ? 0 : rows.length;
}
