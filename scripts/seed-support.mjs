/**
 * The support assistant: Second Pair as its own customer.
 *
 *   node scripts/seed-support.mjs
 *
 * Creates one studio whose "clients" are the business owners using the product,
 * and fills it with what they actually ask. The help button in the dashboard
 * loads that studio's widget — the same route a customer's own website loads —
 * so support can never quietly drift into being a different product, and
 * anything that improves the widget improves this.
 *
 * Deliberately created with NO practitioners. Without one the assistant cannot
 * offer a time or quote a price, which turns a booking engine into exactly what
 * support needs: answer from what it knows, hand over when it does not.
 *
 * Safe to run twice — it updates the studio and replaces the FAQs rather than
 * making a second one.
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

const SLUG = "help";
const OWNER = process.env.SUPPORT_OWNER ?? "20d874ae-b613-4305-a8c2-e89175a551b2";

const TONE = `You are the assistant for Second Pair, an AI receptionist used by one-person
trades, salons and studios. You are never talking to a salon's customer — you are talking
to the owner of a business, or to somebody thinking about becoming one.

Two kinds of people reach you, and they need different things:

An OWNER already has an account and is asking how to do something in it. Point them at the
page — "Settings, then Pricing". Directions only make sense to somebody who is already
inside, so do not give them to anybody who has not said they have an account.

A VISITOR found the website and has no account. They want to know whether this would work
for their trade, what it does, and how to start. Answer plainly, from what you know. Never
give them a price: what it costs is settled in conversation with a person, and inventing a
figure would be a lie about somebody's money. Nobody signs themselves up — every business
is set up personally, together, which is a good thing and worth saying. So get their name,
their trade, and the best way to reach them, then hand over. Ask for those one at a time,
not as a form.

If you cannot tell which you are talking to, ask.

Be brief and plain. No jargon, no "great question", no exclamation marks. These are people
mid-job checking their phone, so answer in two or three sentences and stop.

You are helping somebody use software. You never book anything, never offer times, and
never quote a price — you have no diary and no rates. If somebody asks about their own
clients or their own diary, they mean inside their Second Pair account; tell them where to
look.

If you do not know, say so plainly and hand over rather than guessing. A wrong answer about
somebody's livelihood is worse than a slow one. Hand over immediately for anything about
billing, a refund, losing data, a complaint, or anything that sounds urgent.`;

const GREETING = "Hello — what can I help you with in Second Pair?";

/*
 * What owners actually ask, in the order they hit it. Written from how the
 * product works rather than how it is marketed, because a support answer that
 * is aspirational is worse than none.
 */
const FAQS = [
  ["What does it cost?",
   "That gets settled with a person rather than off a page — it depends on the trade and how much comes through. Leave me your name and the best way to reach you and I will get somebody to talk it through properly. I am not going to make a number up at you."],

  ["Would it work for what I do?",
   "Most likely. It suits anybody where the person doing the work is also the person answering enquiries — one-person trades, salons, studios, mobile and shopfront alike. Tell me your trade and I will say honestly whether it fits."],

  ["How do I sign up?",
   "There is no sign-up form, deliberately. Every business gets set up with somebody — your prices, your hours, your words, your reminders — because an assistant loaded with someone else's settings is worse than none. Give me your name, your trade and how to reach you, and we will get you going."],

  ["What is it, in one line?",
   "It answers your enquiries when you cannot: quotes from your own prices, offers your real free slots, books them in, and fetches you the moment it should not be handling something."],

  ["Is it actually AI, or people?",
   "It is an assistant, and it says so to everybody it talks to. It never claims to be you and never claims to be human — that is not a setting and cannot be turned off. Anything it should not handle comes to you instead."],

  ["How do I put it on my website?",
   "Settings, then Channels. Copy the one line of code it shows you and paste it just before the closing </body> tag on your site. On Squarespace that is Settings, Advanced, Code Injection, Footer. On Wix it is Settings, Custom Code. If you have no website, the same page gives you a plain link instead — put that in your Instagram bio and it works the same way."],

  ["I do not have a website. Can I still use it?",
   "Yes, and plenty do. Settings then Channels gives you a link to your own chat page. Put it in your Instagram or Facebook bio. Anybody who taps it gets the same assistant."],

  ["How does it know my prices?",
   "From what you put in Settings, then Pricing. It never invents a number, never goes below your minimum, and always says a price is an estimate confirmed in person. If your prices are wrong there, its answers will be wrong too — that page is the one worth getting right first."],

  ["Can I stop it quoting prices at all?",
   "Yes. If you leave your rates empty it will not quote and will hand pricing questions to you instead."],

  ["How do I add someone who works with me?",
   "Settings, then the page named after your trade — stylists, artists, engineers. Add them with their hours and their own rate if it differs from yours. They do not need a login for you to manage their diary; a login is optional and you can send one later."],

  ["How do I give someone their own login?",
   "Add them first, then press Give them a login on their row. That creates a link which works once and expires in fourteen days. Send it to them however you normally talk — WhatsApp is fine. When they open it they choose a password."],

  ["Can I stop a member of staff messaging clients?",
   "Yes. Owners can always message customers; for anybody else it is a permission you control. Reading a conversation and writing to a customer in the business's name are different things."],

  ["How do deposits work?",
   "Settings, then Business. You can have a fixed amount, a percentage, or a percentage with a floor — or turn deposits off entirely, which many trades do. When they are on, the assistant sends a payment link and holds the slot until it is paid. The money goes to your own Stripe account, never to us."],

  ["A client says they did not get a reminder.",
   "Open the client from Clients and look at their history. Every reminder that was sent is listed there with the date and whether it arrived. If it says nothing was sent, check that the channel they came in on is connected — Settings then Channels."],

  ["Can I change what the reminders say?",
   "Yes, Settings then Reminders. You can edit the wording and how many hours before the appointment each one goes. The words in double braces, like {{name}}, get filled in — leave those alone and change the rest."],

  ["How do I stop it answering, so I can reply myself?",
   "Open the conversation and press Take over. The assistant goes quiet on that thread and anything you write goes out in your business's voice. Sending a reply does the same thing automatically."],

  ["It said something I would not have said.",
   "Two places fix that. Settings then Assistant lets you set the tone, things to always mention, things to never say, and example replies in your own words — showing it how you write works far better than describing it. And Settings then FAQs is where you put answers it is allowed to give; anything not there, it hands to you rather than guessing."],

  ["Can I use my existing diary?",
   "Yes. If you are on Fresha, Booksy or Square, they each publish a subscription link for your diary. Paste it into the person's settings and Second Pair will read your real availability, so it never offers a slot you have already filled. You keep the diary you know."],

  ["Does it work on my phone?",
   "Yes, and that is where most people use it. Open the site on your phone and add it to your home screen — it then behaves like an app, full screen, with no app store involved."],

  ["Will it tell people it is not a person?",
   "Always. It says so in its first message, and if anybody asks directly it never claims to be human. That is not a setting and cannot be turned off."],

  ["What happens if it cannot answer something?",
   "It hands over to you and stops guessing. Anything medical, any complaint, anybody under eighteen, and anybody who asks for a person goes to you straight away. You get a notification, and the conversation is waiting in your inbox marked as needing you."],

  ["How much does it cost to run?",
   "The assistant itself costs pennies per enquiry — you can see the figure for your own week on The week page, next to what it recovered."],

  ["Somebody messaged out of hours. Did it answer?",
   "Yes. It answers whenever the message arrives, which is the point — most enquiries come in when you are working or asleep. The week page shows how many arrived out of hours."],

  ["Can I see how it is doing?",
   "The week page. What came in, what got booked, what it was worth, how much was handled out of hours, and what it cost to run. The number that matters is what it recovered while you were working."],

  ["I want to delete my account and my data.",
   "Tell me and I will pass it straight to a person. Everything belonging to your business can be deleted completely, including uploaded files, and we will confirm when it is done."],
];

console.log("Second Pair support studio\n");

// ------------------------------------------------------------------- studio
let { data: studio } = await db
  .from("studios")
  .select("id, slug")
  .eq("slug", SLUG)
  .maybeSingle();

const settings = {
  name: "Second Pair",
  slug: SLUG,
  vertical: "general",
  tone: TONE,
  greeting: GREETING,
  deposit_rule: { mode: "none" },
  cancellation_policy: "",
  timezone: "Europe/London",
};

if (studio) {
  const { error } = await db.from("studios").update(settings).eq("id", studio.id);
  if (error) throw new Error(`update: ${error.message}`);
  console.log(`  updated the existing studio (${studio.id})`);
} else {
  const { data: made, error } = await db
    .from("studios")
    .insert(settings)
    .select("id, slug")
    .single();
  if (error) throw new Error(`create: ${error.message}`);
  studio = made;
  console.log(`  created ${studio.id}`);
}

// ------------------------------------------------------------------- owner
const { data: member } = await db
  .from("studio_members")
  .select("user_id")
  .eq("studio_id", studio.id)
  .eq("user_id", OWNER)
  .maybeSingle();

if (!member) {
  const { error } = await db
    .from("studio_members")
    .insert({ studio_id: studio.id, user_id: OWNER, role: "owner" });
  if (error) throw new Error(`member: ${error.message}`);
  console.log("  attached you as the owner, so escalations reach your inbox");
} else {
  console.log("  you are already the owner");
}

// -------------------------------------------------------------------- faqs
await db.from("faqs").delete().eq("studio_id", studio.id);

const { error: faqError } = await db.from("faqs").insert(
  FAQS.map(([question, answer], i) => ({
    studio_id: studio.id,
    question,
    answer,
    sort_order: i,
  })),
);
if (faqError) throw new Error(`faqs: ${faqError.message}`);
console.log(`  wrote ${FAQS.length} answers`);

// ------------------------------------------------------------- no diary
const { data: people } = await db.from("artists").select("id").eq("studio_id", studio.id);
if (people?.length) {
  console.log(`  note: ${people.length} practitioner(s) exist — remove them, or it will try to book people in`);
} else {
  console.log("  no practitioners, so it cannot offer times or quote — which is what support wants");
}

console.log(`\nSwitch it on by adding this to .env.local and to Vercel, then redeploying:\n`);
console.log(`  NEXT_PUBLIC_SUPPORT_SLUG=${SLUG}\n`);
console.log(`Try it at /widget/${SLUG}`);
