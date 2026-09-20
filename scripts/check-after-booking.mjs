/*
 * What a customer does after they are booked in.
 *
 *   node scripts/check-after-booking.mjs [business-slug]
 *
 * check-booking follows somebody from "how much is it" to an appointment in
 * the diary and stops there. Every fault found on the night this was written
 * was past that point, because a script that stops at the booking never asks
 * the three things a real person asks next.
 *
 * Confirming once too many times: the assistant looked at the diary again,
 * found the slot gone — taken by the booking it had just made — and offered
 * the customer a different day for the appointment they already had.
 *
 * Asking to cancel: it escalated correctly, a person has to take it off the
 * diary, and then it said "Done, that's cancelled, Monday 8am is off the diary
 * and nobody will be expecting the Golf." The appointment was still there.
 *
 * Neither is a crash. Both are sentences, and the only way to catch a sentence
 * is to read it — so this checks the words against the database as well as the
 * database against itself.
 *
 * Writes a real enquiry and a real appointment to a demo, then clears both up.
 * Never point it at a live business.
 */
import { db, tidyUp } from "./_tidy.mjs";
import { ORDINARY } from "../src/lib/askingTooMuch.ts";
import { neverSay } from "../src/lib/engine/neverSay.ts";

const SITE = process.env.SITE ?? "https://www.second-pair.com";
const slug = process.argv[2] ?? "cogs-demo";
const session = "book" + Math.random().toString(36).slice(2, 14) + "abcdefgh";
const testNumber = `07700 900${800 + Math.floor(Math.random() * 200)}`;

const client = db();

const say = async (message) => {
  await new Promise((r) => setTimeout(r, ORDINARY.gapMs + 400));
  const r = await fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: slug, session, message }),
  });
  const body = await r.json().catch(() => ({}));

  // Refused is not broken. Saying otherwise sends somebody hunting a fault
  // that is not there — which this check's older sibling used to do.
  if (r.status === 429) {
    console.log(
      `\n  Refused by our own rate limit (${body.error ?? "429"}). This run proves nothing.\n` +
        `  ${ORDINARY.perAddress} messages per address per ${ORDINARY.windowMs / 60000} minutes.\n`,
    );
    await tidyUp(client, slug, ["book"]);
    process.exit(2);
  }

  return body.reply ?? `(no reply: ${body.error ?? r.status})`;
};

const { data: studio } = await client.from("studios").select("id, name").eq("slug", slug).single();

let faults = 0;
const ok = (what) => console.log(`  ok    ${what}`);
const bad = (what, detail) => {
  faults++;
  console.log(`  FAULT ${what}${detail ? ` — ${detail}` : ""}`);
};

console.log(`\n${studio.name}\n`);

const SCRIPTS = {
  "cogs-demo": {
    opening: "hi, how much for an MOT?",
    details: `I'm Dawn Pethick, ${testNumber}. It's a 2019 Golf, reg BD70 XNT, MOT runs out end of next month, about 62,000 miles.`,
  },
  "pawfect-demo": {
    opening: "hi, how much for a full groom for a cocker spaniel?",
    details: `I'm Dawn Pethick, ${testNumber}, and it's Biscuit, a cocker spaniel. His vaccinations run out on ${new Date(Date.now() + 365 * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
  },
  "willow-demo": {
    opening: "hi, how much is a cut and blow dry?",
    details: `I'm Dawn Pethick, ${testNumber}. Just a trim and a blow dry, nothing fancy.`,
  },
};

const script = SCRIPTS[slug];
if (!script) {
  console.log(`No conversation written for ${slug}. Add one to SCRIPTS.`);
  process.exit(1);
}

const talk = async (message) => {
  const reply = await say(message);
  console.log(`  > ${message}`);
  console.log(`    ${reply.replace(/\s+/g, " ").slice(0, 200)}\n`);
  return reply;
};

// ------------------------------------------------- get them booked in
await talk(script.opening);
await talk("what have you got next week?");
await talk("the first one please");
await talk(script.details);

const liveBookings = async () => {
  const { data: conversation } = await client
    .from("conversations")
    .select("id, status, enquiries(id)")
    .eq("studio_id", studio.id)
    .eq("external_ref", session)
    .maybeSingle();

  const enquiryId = conversation?.enquiries?.id;
  if (!enquiryId) return { conversation, bookings: [] };

  const { data, error } = await client
    .from("bookings")
    .select("id, starts_at, cancelled_at")
    .eq("enquiry_id", enquiryId);

  // A refused query returns nothing, which reads exactly like no bookings.
  if (error) {
    bad("could not read the diary", error.message);
    return { conversation, bookings: [] };
  }

  return { conversation, bookings: (data ?? []).filter((b) => !b.cancelled_at) };
};

const booked = await liveBookings();
if (booked.bookings.length !== 1) {
  bad("the booking never happened", `${booked.bookings.length} in the diary`);
  await tidyUp(client, slug, ["book"]);
  process.exit(faults ? 1 : 0);
}
ok(`booked: ${new Date(booked.bookings[0].starts_at).toLocaleString("en-GB")}`);

// ------------------------------------------------- saying yes once too often
const again = await talk("yes please, book that in");

/*
 * Offering another day here means it has read the customer's own appointment
 * back to them as somebody else having taken the slot.
 */
if (/\b(instead|another day|rather|earliest .* is|only .* left)\b/i.test(again) && /\b\d{1,2}(:\d\d)?\s?(am|pm)\b/i.test(again)) {
  bad("offered a different time to somebody who was only confirming", again.replace(/\s+/g, " ").slice(0, 140));
} else {
  ok("a second yes is read as confirming, not as a new request");
}

const afterYes = await liveBookings();
if (afterYes.bookings.length !== 1) {
  bad("confirming again changed the diary", `${afterYes.bookings.length} appointments now`);
} else {
  ok("still exactly one appointment");
}

// ------------------------------------------------- asking to cancel
const cancelReply = await talk("sorry, something's come up — can I cancel that please?");

/*
 * The assistant has no tool for cancelling. A person takes it off the diary,
 * so the appointment must still be there — and the customer must not have been
 * told otherwise.
 */
const afterCancel = await liveBookings();
if (afterCancel.bookings.length !== 1) {
  bad("the appointment vanished", "only a person can cancel one");
} else {
  ok("the appointment is still there for a person to take off");
}

const slips = [...neverSay(cancelReply), ...neverSay(again)];
if (slips.length) {
  for (const slip of slips) bad(slip.what, `"${slip.saying}"`);
} else {
  ok("nothing said that was not true");
}

if (afterCancel.conversation?.status === "needs_human") {
  ok("handed to a person");
} else {
  bad("nobody was asked to deal with it", `the conversation is "${afterCancel.conversation?.status}"`);
}

// ------------------------------------------------- put the demo back
for (const b of [...booked.bookings, ...afterCancel.bookings]) {
  await client.from("reminders").delete().eq("booking_id", b.id);
  await client.from("bookings").delete().eq("id", b.id);
}
await tidyUp(client, slug, ["book"]);

console.log(faults ? `\n${faults} thing${faults > 1 ? "s" : ""} wrong.` : "\nNothing wrong after the booking either.");
process.exitCode = faults ? 1 : 0;
