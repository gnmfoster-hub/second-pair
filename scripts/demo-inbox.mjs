/**
 * The demo salon's inbox: enquiries answered, quoted, booked and handed over.
 *
 *   node scripts/demo-inbox.mjs
 *
 * demo-salon.mjs fills the diary, which shows what the business looks like but
 * not what the product does. The whole argument is that messages get answered
 * in under a minute, from the salon's own prices, and turn into appointments —
 * and an empty inbox demonstrates none of it. Somebody being shown this over a
 * coffee needs to open Inbox and find conversations that already read like
 * their own.
 *
 * So: a spread of channels, a spread of outcomes, and one of each of the
 * things people ask about when they are deciding whether to trust it — a price
 * held to, a deposit taken, a complaint handed straight to a human, and a
 * question about something the salon does not do.
 *
 * Safe to run repeatedly. It clears the demo studio's conversations first, so
 * the times are always relative to today.
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

const SLUG = "willow-demo";

const { data: studio } = await db
  .from("studios")
  .select("id, kind")
  .eq("slug", SLUG)
  .maybeSingle();

if (!studio) {
  console.error(`No studio "${SLUG}". Run scripts/demo-salon.mjs first.`);
  process.exit(1);
}

/*
 * The same guard the back office uses.
 *
 * This script deletes conversations and writes messages under a business's
 * name. It is keyed on a slug, which is one typo away from doing that to a
 * real inbox — so it refuses anything that is not the demo, rather than
 * trusting the name to stay unique.
 */
if (studio.kind !== "demo") {
  console.error(`"${SLUG}" is not kind = demo. Refusing to touch it.`);
  process.exit(1);
}

const { data: team } = await db
  .from("artists")
  .select("id, name")
  .eq("studio_id", studio.id)
  .order("created_at");

const person = (name) => team.find((a) => a.name === name) ?? team[0];

/*
 * Services and answers, so the demo is a salon that is set up.
 *
 * Without these the Inbox opens on "Your assistant is not ready yet" with a
 * blocking item reading "No services are set up, so it cannot put a number on
 * anything" — which is the first thing anybody being shown this would read,
 * and it says the product does not work. The demo has to be a business that
 * finished setting up, because that is what is being demonstrated.
 */
const SERVICES = [
  ["Cut and blow dry", 0.75, 1.25, 0],
  ["Root touch-up", 1, 1.5, 1],
  ["Half head of foils", 2, 2.75, 2],
  ["Full head of highlights", 3, 4, 3],
  ["Balayage", 2.5, 3.5, 4],
  ["Gloss and toner", 0.5, 1, 5],
  ["Wedding hair", 2, 4, 6],
];

for (const [size_label, hours_low, hours_high, sort_order] of SERVICES) {
  const { error } = await db
    .from("price_bands")
    .upsert(
      { studio_id: studio.id, size_label, hours_low, hours_high, sort_order },
      { onConflict: "studio_id,size_label" },
    );
  if (error) throw error;
}

const FAQS = [
  [
    "Do you do a patch test?",
    "Yes — for any colour, we need a patch test at least 48 hours before. It takes two minutes and you can pop in any time we are open.",
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
    "Of course. There is room for a pram by the window and we would rather you came with them than not at all.",
  ],
];

for (const [i, [question, answer]] of FAQS.entries()) {
  const { data: had } = await db
    .from("faqs")
    .select("id")
    .eq("studio_id", studio.id)
    .eq("question", question)
    .maybeSingle();

  if (had) await db.from("faqs").update({ answer, sort_order: i }).eq("id", had.id);
  else {
    const { error } = await db
      .from("faqs")
      .insert({ studio_id: studio.id, question, answer, sort_order: i });
    if (error) throw error;
  }
}

/** Minutes ago, so every thread is fresh however long the demo has stood. */
const now = new Date();
const ago = (mins) => new Date(now.getTime() - mins * 60_000).toISOString();

/*
 * Last night at half nine, for the one that came in after closing.
 *
 * "Won while you were busy" only counts what arrived outside opening hours, so
 * with every thread timed in minutes-ago it read £0 whenever the demo was
 * opened during the day — the one figure on the screen that answers "is this
 * worth paying for", showing nothing, in the middle of a demonstration.
 */
const lastNight = (hour, minute) => {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

/** A time on a day relative to today, for the appointments these turned into. */
const onDay = (offset, hour, minute) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/*
 * Their own contacts, kept apart from the diary's regulars.
 *
 * A conversation needs a contact, and reusing the regulars would have put
 * first-time enquiries in the name of somebody with eighteen months of
 * history — which reads wrong the moment anybody clicks through to a client.
 */
const ENQUIRERS = [
  { name: "Hannah Beecham", phone: "+447700900311" },
  { name: "Leila Osman", phone: "+447700900312" },
  { name: "Fran Doyle", phone: "+447700900313" },
  { name: "Megan Attwood", phone: "+447700900314" },
  { name: "Sophie Laing", phone: "+447700900315" },
  { name: "Priya Ahmed", phone: "+447700900316" },
  { name: "Beth Corrigan", phone: "+447700900317" },
  { name: "Ivy Sandford", phone: "+447700900318" },
];

const contacts = {};
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

  const { data, error } = await db
    .from("contacts")
    .insert({ studio_id: studio.id, name: c.name, phone: c.phone })
    .select("id")
    .single();
  if (error) throw error;
  contacts[c.name] = data.id;
}

// Start clean, so re-running does not stack eight more threads on the last set.
{
  const { data: old } = await db
    .from("conversations")
    .select("id")
    .eq("studio_id", studio.id);
  for (const c of old ?? []) await db.from("conversations").delete().eq("id", c.id);
}

/*
 * Written the way people actually type: no capital at the start, three
 * questions in one line, a change of mind halfway through. An inbox full of
 * tidy sentences is the tell that nothing in it ever happened.
 */
const THREADS = [
  {
    who: "Hannah Beecham",
    channel: "whatsapp",
    status: "booked",
    // After closing, which is the whole argument: nobody was there and it
    // still took the booking and the deposit.
    openedAt: lastNight(21, 34),
    booking: { artist: "Sarah", in: 2, hour: 10, minute: 0, mins: 150, price: 12500, paid: true },
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
        "Sarah has Saturday the 20th at 10:00, Saturday the 27th at 1:30, or Thursday the 18th at 5:15. Which suits?",
      ],
      [31, "client", "sat 20th at 10 is perfect"],
      [
        30,
        "assistant",
        "Booked in with Sarah, Saturday the 20th at 10:00. There is a £25 deposit to hold it, which comes off the price on the day — I have sent the link over. See you then.",
      ],
      [24, "client", "paid, thanks!"],
    ],
  },
  {
    who: "Leila Osman",
    channel: "web",
    status: "deposit_paid",
    booking: { artist: "Nadia", in: 3, hour: 10, minute: 0, mins: 180, price: 14000, paid: true },
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
    enquiry: {
      intent: "question",
      description: "Keratin — not something we do",
    },
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
    booking: { artist: "Mo", in: 1, hour: 11, minute: 15, mins: 75, price: 5500, paid: true },
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

let threads = 0;
let written = 0;
let appointments = 0;

for (const t of THREADS) {
  const opened = t.messages[0][0];
  const latest = t.messages.at(-1)[0];

  const { data: conv, error } = await db
    .from("conversations")
    .insert({
      studio_id: studio.id,
      contact_id: contacts[t.who],
      channel: t.channel,
      status: t.status,
      // The number the report reads for "answered in under a minute".
      first_response_ms: 22_000 + ((threads * 7919) % 34_000),
      last_message_at: ago(latest),
      created_at: t.openedAt ?? ago(opened),
    })
    .select("id")
    .single();
  if (error) throw error;

  for (const [mins, role, content] of t.messages) {
    const { error: mErr } = await db
      .from("messages")
      .insert({ conversation_id: conv.id, role, content, created_at: ago(mins) });
    if (mErr) throw mErr;
    written++;
  }

  if (t.enquiry) {
    const { artist, ...rest } = t.enquiry;
    const { data: enq, error: eErr } = await db
      .from("enquiries")
      .insert({
        conversation_id: conv.id,
        ...rest,
        artist_id: artist ? person(artist).id : null,
      })
      .select("id")
      .single();
    if (eErr) throw eErr;

    /*
     * The appointment the conversation turned into.
     *
     * Without this the Inbox reads "0 booked in" and "£0 won" over a list of
     * threads plainly marked Booked, which is the sort of contradiction a
     * person notices in a demo and cannot unsee. The figures count
     * conversations whose enquiry has a booking, so the two have to be joined
     * up rather than merely both present.
     */
    if (t.booking) {
      const b = t.booking;
      const starts = onDay(b.in, b.hour, b.minute);
      const ends = new Date(starts.getTime() + b.mins * 60_000);

      /*
       * Clear the chair first.
       *
       * demo-salon.mjs fills the week solid, and the database has an exclusion
       * constraint so one person cannot be in two places at once — which is
       * correct, and meant every one of these landed on top of an appointment
       * already there and threw. The made-up week gives way to the booking
       * that has a conversation behind it, because that is the one the demo is
       * actually about.
       */
      const { data: clash } = await db
        .from("bookings")
        .select("id")
        .eq("artist_id", person(b.artist).id)
        .is("cancelled_at", null)
        .lt("starts_at", ends.toISOString())
        .gt("ends_at", starts.toISOString());
      for (const c of clash ?? []) await db.from("bookings").delete().eq("id", c.id);

      const { error: bErr } = await db.from("bookings").insert({
        enquiry_id: enq.id,
        artist_id: person(b.artist).id,
        contact_id: contacts[t.who],
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        type: "session",
        title: t.enquiry.description,
        source: "assistant",
        price_pence: b.price,
        deposit_amount_pence: 2500,
        deposit_status: b.paid ? "paid" : "link_sent",
        blocks_availability: true,
      });
      if (bErr) throw bErr;
      appointments++;
    }
  }

  threads++;
}

console.log(
  `${threads} conversations, ${written} messages and ${appointments} appointments for ${SLUG}.`,
);
console.log("Booked, deposit paid, qualified, needs a human, brand new, and one lost.");
