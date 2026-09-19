/*
 * A customer books, and everything that should have happened, happened.
 *
 *   node scripts/check-booking.mjs [business-slug]
 *
 * The other checks look at screens, columns and replies. This one follows the
 * money: somebody asks a price, is offered times, takes one, and the business
 * ends up with an appointment in the diary and a person on the client list.
 * That is the whole product, and it is the one path where a fault costs a
 * business real work rather than looking untidy.
 *
 * It checks the database rather than the wording, because the assistant can
 * say "you're booked in" perfectly well while nothing has been written — which
 * is the failure that matters and the one a person reading the transcript
 * would not catch.
 *
 * Writes a real enquiry and a real appointment to a demo, then clears both up.
 * Never point it at a live business.
 */
import { db, tidyUp } from "./_tidy.mjs";
import { ORDINARY } from "../src/lib/askingTooMuch.ts";

const SITE = process.env.SITE ?? "https://www.second-pair.com";
const slug = process.argv[2] ?? "pawfect-demo";
const session = "book" + Math.random().toString(36).slice(2, 14) + "abcdefgh";

/*
 * A number no other run has used.
 *
 * 07700 900xxx is Ofcom's range for drama and testing — it reaches nobody, and
 * it is the only range safe to type into a real business. It was a fixed
 * 07700 900123, which collided with a contact an older test had left on the
 * driving school under a different name: the assistant refused to put that
 * number on somebody else's record, exactly as it should, and the check
 * reported the business as broken.
 *
 * The seeded demo clients sit in 9003xx, so runs take 9008xx and 9009xx.
 */
const testNumber = `07700 900${(800 + Math.floor(Math.random() * 200)).toString()}`;

/*
 * Refused is not the same as broken, and this check once could not tell them
 * apart.
 *
 * Running five demos back to back spends more than one address is allowed in
 * ten minutes, so the sixth message onwards came back 429 "Slow down". The
 * conversation then stopped where it stood, and the checks below dutifully
 * reported that no price was recorded and nothing reached the diary — three
 * faults against a business that had done nothing wrong, and half an hour
 * spent looking for a bug in the wrong place.
 *
 * A check that reports a fault it invented is worse than no check, because it
 * is believed. So a refusal stops the run outright and says what happened.
 */
const say = async (message) => {
  const r = await fetch(`${SITE}/api/widget/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studio: slug, session, message }),
  });
  const body = await r.json().catch(() => ({}));

  if (r.status === 429) {
    console.log(
      `\n  Refused by our own rate limit (${body.error ?? "429"}).\n` +
        `  This run proves nothing either way — the conversation never finished.\n` +
        `  It is ${ORDINARY.perAddress} messages per address per ${ORDINARY.windowMs / 60000} minutes,` +
        ` so leave a gap before sweeping the demos again.\n`,
    );
    await tidyUp(client, slug, ["book"]);
    process.exit(2);
  }

  return body.reply ?? `(no reply: ${body.error ?? r.status})`;
};

const client = db();
const { data: studio } = await client.from("studios").select("id, name").eq("slug", slug).single();

let faults = 0;
const ok = (what) => console.log(`  ok    ${what}`);
const bad = (what, detail) => {
  faults++;
  console.log(`  FAULT ${what}${detail ? ` — ${detail}` : ""}`);
};

console.log(`\n${studio.name}\n`);

/*
 * A real conversation, in the order a real one happens: what does it cost,
 * when can you do it, yes please, here are my details. With a vaccination date
 * a year out, worked out rather than typed.
 *
 * The first version of this gave a date in the past and the assistant refused
 * to book — correctly, because a groomer cannot take a dog whose vaccinations
 * have run out, and that guard is the whole reason the trade keeps the date.
 * A hard-coded date would have started failing the day it went stale, which is
 * how a check ends up being ignored.
 */
const nextYear = new Date(Date.now() + 365 * 86_400_000).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/*
 * What a customer of this trade would actually say.
 *
 * The first version asked every business about a cocker spaniel, and a salon,
 * a garage and a driving school all quite reasonably declined to book one.
 * Three businesses reported as broken, none of them broken: a check that asks
 * the wrong question proves nothing and wastes the morning of whoever reads it.
 *
 * Each trade also has its own thing it must know before it can book — a dog's
 * vaccination date, a car's registration, a pupil's postcode — and getting
 * that wrong is the difference between testing the booking path and testing
 * the refusal path.
 */
const SCRIPTS = {
  "pawfect-demo": [
    "hi, how much for a full groom for a cocker spaniel?",
    "sounds good, what have you got next week?",
    "the first one please",
    `I'm Dawn Pethick, ${testNumber}, and it's Biscuit, a cocker spaniel. His vaccinations run out on ${nextYear}. He's fine with grooming, never snapped at anybody.`,
    "yes please, book that in",
  ],
  "willow-demo": [
    "hi, how much is a cut and blow dry?",
    "great, what have you got next week?",
    "the first one please",
    `I'm Dawn Pethick, ${testNumber}. Just a trim and a blow dry, nothing fancy.`,
    "yes please, book that in",
  ],
  "cogs-demo": [
    "hi, how much for an MOT?",
    "what have you got next week?",
    "the first one please",
    `I'm Dawn Pethick, ${testNumber}. It's a 2019 Golf, reg BD70 XNT, MOT runs out end of next month, about 62,000 miles.`,
    "yes please, book that in",
  ],
  /*
   * The details come first here, because an instructor cannot offer a time
   * until they know the postcode is one they cover — so asking for times
   * before saying where you are gets the question back, and the script fell a
   * turn behind itself and ended on "which one would you like?".
   *
   * That read as "nothing reached the diary", which was true and meant nothing:
   * the conversation was fine and the script was the thing that never picked a
   * slot.
   */
  "dansdriving-demo": [
    "hi, how much is a driving lesson?",
    `I'm Dawn Pethick, ${testNumber}, postcode BS1 4ST. I've passed my theory, back in March.`,
    "what have you got next week?",
    "the first one please",
    "yes please, book that in",
  ],
  "ashcroft-demo": [
    "hi, roughly what would it cost to add a couple of sockets in a bedroom?",
    `I'm Dawn Pethick, ${testNumber}, postcode BS1 4ST. Two double sockets, normal plasterboard walls, and there's parking outside.`,
    "what have you got next week?",
    "the first one please",
    "yes please, book that in",
  ],
};

const script = SCRIPTS[slug];
if (!script) {
  console.log(`No conversation written for ${slug}. Add one to SCRIPTS — a check that asks the wrong trade the wrong question proves nothing.`);
  process.exit(1);
}

for (const message of script) {
  // A person types slower than a loop does; below the gap and we refuse ourselves.
  await new Promise((r) => setTimeout(r, ORDINARY.gapMs + 400));
  const reply = await say(message);
  console.log(`  > ${message}`);
  console.log(`    ${reply.replace(/\s+/g, " ").slice(0, 190)}\n`);
}

// ------------------------------------------------- what should now be true
const { data: conversation } = await client
  .from("conversations")
  .select("id, status, contact_id, enquiries(id, description, quote_low_pence)")
  .eq("studio_id", studio.id)
  .eq("external_ref", session)
  .maybeSingle();

if (!conversation) {
  bad("the conversation was never written down");
} else {
  ok(`a conversation exists, marked "${conversation.status}"`);

  const contact = conversation.contact_id
    ? (await client.from("contacts").select("name, phone").eq("id", conversation.contact_id).maybeSingle()).data
    : null;

  if (!contact) bad("nobody was added to the client list");
  else if (!contact.name) bad("the client has no name", "they gave one");
  else if (!contact.phone) bad("the client has no number", "they gave one");
  else ok(`the client is on the list as ${contact.name}, ${contact.phone}`);

  const enquiry = conversation.enquiries;
  if (!enquiry) bad("no enquiry was recorded");
  else if (!enquiry.quote_low_pence) bad("no price was recorded against the enquiry");
  else ok(`a price was recorded: £${(enquiry.quote_low_pence / 100).toFixed(2)}`);

  const { data: bookings } = enquiry
    ? await client.from("bookings").select("id, starts_at, cancelled_at, artist_id").eq("enquiry_id", enquiry.id)
    : { data: [] };

  const live = (bookings ?? []).filter((b) => !b.cancelled_at);
  if (live.length === 0) bad("nothing reached the diary", "the conversation reached details and a held slot");
  else {
    ok(`the diary has it: ${new Date(live[0].starts_at).toLocaleString("en-GB")}`);

    /*
     * A booking with no reminder is a no-show waiting to happen, and it is the
     * half nobody notices until somebody does not turn up.
     */
    const { count } = await client
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", live[0].id);
    if (!count) bad("no reminder was scheduled for it");
    else ok(`${count} reminder${count > 1 ? "s" : ""} scheduled`);
  }

  // Put the demo back as it was.
  for (const b of bookings ?? []) {
    await client.from("reminders").delete().eq("booking_id", b.id);
    await client.from("bookings").delete().eq("id", b.id);
  }
}

await tidyUp(client, slug, ["book"]);

console.log(faults ? `\n${faults} thing${faults > 1 ? "s" : ""} did not happen.` : "\nEverything that should have happened, happened.");
process.exitCode = faults ? 1 : 0;
