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
};

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
      intent: "new_tattoo",
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
      intent: "new_tattoo",
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
      intent: "new_tattoo",
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
    .select("id")
    .eq("studio_id", studio.id)
    .limit(40);

  const clients = regulars ?? [];

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
        await db.from("bookings").insert({
          artist_id: stylist.id,
          contact_id: clients.length ? clients[n % clients.length].id : null,
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + mins * 60_000).toISOString(),
          type: "session",
          title,
          // A quarter look like the assistant's work, which is the point of the
          // product and should be visible in the demo.
          source: n % 4 === 0 ? "assistant" : "manual",
          price_pence: price,
          deposit_amount_pence: 0,
          blocks_availability: true,
        });
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

  return { appointments, conversations, messages };
}
