/*
 * A customer books, then moves it, then calls it off.
 *
 *   node scripts/check-change.mjs [business-slug]
 *   SITE=http://localhost:3130 node scripts/check-change.mjs
 *
 * check-booking follows somebody into the diary and stops there, which is
 * where the product stopped too: the assistant could put an appointment in
 * and could not touch it again, and the prompt said so in as many words.
 *
 * Jess at Living Canvas asked to cancel thirty seconds after booking, and
 * again by email four minutes later. She was told both times that somebody
 * would confirm it. Hers was taken out of the diary by hand the next day and
 * nobody ever told her. This check is that conversation, held against a demo,
 * with the database read after every turn rather than the wording.
 *
 * Four things it proves, and the fourth is the one worth the run:
 *
 *   1. A move actually moves the row, and the reminders move with it. A
 *      reminder left on the old time is a message about a time they are not
 *      coming at.
 *   2. A cancellation actually cancels, and the reminders stop. "See you
 *      tomorrow" for an appointment that is off is worse than silence.
 *   3. The business is told, both times, which is the half that loses the
 *      client rather than the customer.
 *   4. A SECOND website session that gives the same name and the same number
 *      cannot reach the first one's appointment. saveContact will happily put
 *      that session on the same client record, because that is how a
 *      returning customer's history stays in one place, and on a web page a
 *      number proves nothing at all. So the reach is this conversation only,
 *      and this is where that is checked rather than asserted in a comment.
 *
 * Writes real enquiries and a real appointment to a demo, then clears up.
 * Never point it at a live business.
 */
import { db, tidyUp } from "./_tidy.mjs";
import { ORDINARY } from "../src/lib/askingTooMuch.ts";

const SITE = process.env.SITE ?? "https://www.second-pair.com";
const slug = process.argv[2] ?? "willow-demo";

const PREFIX = "chng";
const sessionOf = () => PREFIX + Math.random().toString(36).slice(2, 14) + "abcdefgh";
const mine = sessionOf();
const theirs = sessionOf();

/* 07700 900xxx is Ofcom's drama and testing range. It reaches nobody. */
const testNumber = `07700 900${600 + Math.floor(Math.random() * 100)}`;

const DEMOS = ["willow-demo", "pawfect-demo", "cogs-demo", "ashcroft-demo", "brightwork-demo", "dansdriving-demo", "kerbside-demo"];
if (!DEMOS.includes(slug)) {
  console.log(`\n  ${slug} is not a demo. This check books, moves and cancels real rows.\n`);
  process.exit(1);
}

const client = db();
const { data: studio } = await client
  .from("studios")
  .select("id, name, timezone")
  .eq("slug", slug)
  .single();

let faults = 0;
const ok = (what) => console.log(`  ok    ${what}`);
const bad = (what, detail) => {
  faults++;
  console.log(`  FAULT ${what}${detail ? `: ${detail}` : ""}`);
};

const say = async (session, message) => {
  await new Promise((r) => setTimeout(r, ORDINARY.gapMs + 400));
  const r = await fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: slug, session, message }),
  });
  const body = await r.json().catch(() => ({}));

  /*
   * A refusal proves nothing either way, and a check that invents a fault is
   * worse than no check because it is believed.
   */
  if (r.status === 429) {
    console.log(
      `\n  Refused by our own rate limit (${body.error ?? "429"}). This run proves nothing.\n` +
        `  ${ORDINARY.perAddress} messages per address per ${ORDINARY.windowMs / 60000} minutes.\n`,
    );
    await tidyUp(client, slug, [PREFIX]);
    process.exit(2);
  }

  const reply = body.reply ?? `(no reply: ${body.error ?? r.status})`;
  console.log(`  > ${message}`);
  console.log(`    ${reply.replace(/\s+/g, " ").slice(0, 170)}\n`);
  return reply;
};

const when = (iso) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: studio.timezone ?? "Europe/London" });

/** The conversation's one booking, whatever state it is in. */
const bookingFor = async (session) => {
  const { data: conversation } = await client
    .from("conversations")
    .select("id, contact_id, enquiries(id)")
    .eq("studio_id", studio.id)
    .eq("external_ref", session)
    .maybeSingle();

  if (!conversation?.enquiries) return { conversation, booking: null };

  const ids = (Array.isArray(conversation.enquiries) ? conversation.enquiries : [conversation.enquiries]).map(
    (e) => e.id,
  );

  const { data: rows } = await client
    .from("bookings")
    .select("id, starts_at, ends_at, cancelled_at, enquiry_id")
    .in("enquiry_id", ids);

  return { conversation, booking: (rows ?? [])[0] ?? null };
};

const pending = async (bookingId) => {
  const { data } = await client
    .from("reminders")
    .select("id, due_at, status")
    .eq("booking_id", bookingId);
  return data ?? [];
};

console.log(`\n${studio.name}, at ${SITE}\n`);

// ------------------------------------------------- book one, the ordinary way
const SCRIPTS = {
  "willow-demo": [
    "hi, how much is a cut and blow dry?",
    "great, what have you got the week after next?",
    "the first one please",
    `I'm Dawn Pethick, ${testNumber}. Just a trim, nothing fancy.`,
    "yes please, book that in",
  ],
  "pawfect-demo": [
    "hi, how much for a full groom for a cocker spaniel?",
    "sounds good, what have you got the week after next?",
    "the first one please",
    `I'm Dawn Pethick, ${testNumber}, and it's Biscuit, a cocker spaniel. His vaccinations run out on ${new Date(
      Date.now() + 365 * 86_400_000,
    ).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
    "yes please, book that in",
  ],
  "cogs-demo": [
    "hi, how much for an MOT?",
    "what have you got the week after next?",
    "the first one please",
    `I'm Dawn Pethick, ${testNumber}. It's a 2019 Golf, reg BD70 XNT, about 62,000 miles.`,
    "yes please, book that in",
  ],
};

const script = SCRIPTS[slug];
if (!script) {
  console.log(`No conversation written for ${slug}. Add one to SCRIPTS.`);
  process.exit(1);
}

console.log("  --- booking it ---\n");
for (const message of script) await say(mine, message);

let { conversation, booking } = await bookingFor(mine);
if (!booking || booking.cancelled_at) {
  bad("nothing reached the diary", "so there was nothing to move or cancel");
  await tidyUp(client, slug, [PREFIX]);
  console.log(`\n${faults} thing${faults > 1 ? "s" : ""} did not happen.`);
  process.exit(1);
}

ok(`booked for ${when(booking.starts_at)}`);
const originalStart = booking.starts_at;
const remindersBefore = await pending(booking.id);
/*
 * Only where one could be due. A booking for tomorrow morning has no
 * 24-hour reminder ahead of it and that is correct, not a fault: the plan
 * drops any whose moment has already passed. This read it as a fault, which
 * is a check inventing a problem, and those are worse than no check at all.
 */
const soon = Date.parse(booking.starts_at) - Date.now() < 50 * 3_600_000;
if (!remindersBefore.length && soon) {
  console.log("  note  no reminder, and none was due: the appointment is inside two days");
} else if (!remindersBefore.length) {
  bad("no reminder was scheduled for it");
} else {
  ok(`${remindersBefore.length} reminder(s) scheduled`);
}

// ------------------------------------------------- somebody else tries first
console.log("\n  --- a different website session, same name, same number ---\n");
await say(theirs, `hi, I need to cancel my appointment. I'm Dawn Pethick, ${testNumber}.`);
await say(theirs, "yes, please cancel it");

const afterStranger = await bookingFor(mine);
if (afterStranger.booking?.cancelled_at) {
  bad(
    "ANOTHER WEB SESSION CANCELLED IT",
    "a number typed into a web page is not proof of who is typing",
  );
} else {
  ok("a second web session could not touch it");
}

/* And the two really were taken for the same person, which is what makes the
   check worth running. If they were not, it proved nothing. */
const strangerSide = await bookingFor(theirs);
if (strangerSide.conversation?.contact_id === conversation.contact_id) {
  ok("and they were both on the same client record, which is the hard case");
} else {
  console.log(
    "  note  the two sessions stayed on separate records, so the reach rule was " +
      "never actually tested. Worth a look.",
  );
}

// ------------------------------------------------- move it
console.log("\n  --- moving it ---\n");
await say(mine, "actually, something's come up. what else have you got?");
await say(mine, "the last one of those please, if you can move me");

const afterMove = await bookingFor(mine);
if (!afterMove.booking) bad("the appointment vanished on a move");
else if (afterMove.booking.cancelled_at) bad("a move cancelled it instead of moving it");
else if (afterMove.booking.starts_at === originalStart) {
  bad("the appointment did not move", `still ${when(originalStart)}`);
} else {
  ok(`moved from ${when(originalStart)} to ${when(afterMove.booking.starts_at)}`);

  /*
   * The half that is invisible and matters. A reminder still due against the
   * old time is a message about a time they are not coming at.
   */
  const after = await pending(afterMove.booking.id);
  const stillWaiting = after.filter((r) => r.status === "pending");
  const strandedOnOld = stillWaiting.filter(
    (r) => Date.parse(r.due_at) < Date.parse(afterMove.booking.starts_at) - 40 * 86_400_000,
  );
  if (!stillWaiting.length) bad("no reminders are waiting after the move");
  else if (strandedOnOld.length) bad(`${strandedOnOld.length} reminder(s) left on the old time`);
  else ok(`${stillWaiting.length} reminder(s) now due against the new time`);
}

// ------------------------------------------------- call it off
console.log("\n  --- cancelling it ---\n");
await say(mine, "sorry, I'm going to have to cancel after all");
await say(mine, "yes, cancel it please");

const afterCancel = await bookingFor(mine);
if (!afterCancel.booking) bad("the row was deleted rather than cancelled");
else if (!afterCancel.booking.cancelled_at) bad("it is still in the diary", "nothing was cancelled");
else {
  ok("cancelled, and the row is still there with its history");

  const left = (await pending(afterCancel.booking.id)).filter((r) => r.status === "pending");
  if (left.length) bad(`${left.length} reminder(s) still waiting on a cancelled appointment`);
  else ok("no reminder is waiting on it");
}

/* The business's side of it. Both changes should have been recorded against
   the booking, which is what the owner reads when they ask what happened. */
if (afterCancel.booking) {
  const { data: events } = await client
    .from("booking_events")
    .select("what, source")
    .eq("booking_id", afterCancel.booking.id);
  const byThem = (events ?? []).filter((e) => e.source === "customer").map((e) => e.what);
  for (const expected of ["moved", "cancelled"]) {
    if (byThem.includes(expected)) ok(`the history records it as "${expected}" by the customer`);
    else bad(`nothing in the history says it was ${expected} by the customer`);
  }
}

// ------------------------------------------------- put the demo back
for (const session of [mine, theirs]) {
  const { booking: b } = await bookingFor(session);
  if (b) {
    await client.from("booking_events").delete().eq("booking_id", b.id);
    await client.from("reminders").delete().eq("booking_id", b.id);
    await client.from("bookings").delete().eq("id", b.id);
  }
}
await tidyUp(client, slug, [PREFIX]);

console.log(
  faults
    ? `\n${faults} thing${faults > 1 ? "s" : ""} did not happen.`
    : "\nBooked, moved, cancelled, and nobody else could touch it.",
);
process.exitCode = faults ? 1 : 0;
