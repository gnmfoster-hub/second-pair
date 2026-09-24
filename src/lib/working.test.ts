import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, summarise, type Facts, type Thing } from "./working.ts";

const nothing: Facts = {
  sold: ["web"],
  receptionistAllowed: false,
  receptionistOn: false,
  people: [],
  connected: {},
  smsConfigured: true,
  emailWorks: true,
  stripeReady: false,
  voicemailOn: false,
  reminderTemplates: 0,
  hasConfirmation: false,
  uncovered: [],
  reviewLink: false,
  marketingSold: false,
  optedIn: 0,
  savedMessages: 0,
  ever: {
    textDelivered: false,
    emailDelivered: false,
    callTaken: false,
    webChat: false,
    paymentTaken: false,
    reminderSent: false,
    confirmationSent: false,
    reviewAsked: false,
    campaignSent: false,
    formSigned: false,
    messageByHand: false,
  },
};

const facts = (over: Partial<Omit<Facts, "ever">> & { ever?: Partial<Facts["ever"]> }): Facts => ({
  ...nothing,
  ...over,
  ever: { ...nothing.ever, ...(over.ever ?? {}) },
});

const find = (things: Thing[], key: string) => things.find((t) => t.key === key)!;

/*
 * The whole point: a business is never shown a capability it has not been
 * sold. A page listing everything the product can do, against one salon, is a
 * brochure — and the question being asked is "is MY setup working".
 */
test("only what they have been sold is listed", () => {
  const bare = assess(nothing).map((t) => t.key);
  assert.ok(!bare.includes("sms"));
  assert.ok(!bare.includes("voice"));
  assert.ok(!bare.includes("receptionist"));
  assert.ok(!bare.includes("marketing"));

  const full = assess(
    facts({ sold: ["web", "sms", "voice", "email"], receptionistAllowed: true, marketingSold: true }),
  ).map((t) => t.key);
  assert.ok(full.includes("sms"));
  assert.ok(full.includes("voice"));
  assert.ok(full.includes("receptionist"));
  assert.ok(full.includes("marketing"));
});

/*
 * The first broken link and no further. A business with no number does not
 * need telling that no text has ever been delivered — it needs telling it has
 * no number.
 */
test("it names the first break, not every break", () => {
  const sms = find(assess(facts({ sold: ["web", "sms"] })), "sms");
  assert.equal(sms.stuckAt, "connected");
  assert.match(sms.because ?? "", /no number/i);
});

test("a chain that holds is reported as holding", () => {
  const sms = find(
    assess(
      facts({
        sold: ["web", "sms"],
        connected: { sms: 1 },
        ever: { textDelivered: true },
      }),
    ),
    "sms",
  );
  assert.equal(sms.stuckAt, null);
  assert.equal(sms.because, null);
  assert.equal(sms.fix, null);
});

/*
 * Set up but never used is its own state, and it is not a fault. It is the
 * state most things are in on a business's first week, and calling it broken
 * would make the page cry wolf on day one.
 */
test("set up but never used is stuck at proven, not at connected", () => {
  const sms = find(assess(facts({ sold: ["web", "sms"], connected: { sms: 1 } })), "sms");
  assert.equal(sms.stuckAt, "proven");
});

/*
 * The failure Giles has actually hit: texts work, the voice webhook was never
 * pasted in, and every missed call goes nowhere with nothing on any screen.
 */
test("calls with a number but nothing ever received says where to look", () => {
  const voice = find(assess(facts({ sold: ["web", "sms", "voice"], connected: { sms: 1 } })), "voice");
  assert.equal(voice.stuckAt, "proven");
  assert.match(voice.because ?? "", /webhook/i);
});

/*
 * The one thing this page must never claim. The talking agent is not built,
 * so no Receptionist has answered anything, and a tick there would be the
 * only outright lie on the screen.
 */
test("the Receptionist is never shown as proven", () => {
  const r = find(
    assess(
      facts({
        sold: ["web", "sms"],
        receptionistAllowed: true,
        receptionistOn: true,
        connected: { sms: 1 },
      }),
    ),
    "receptionist",
  );
  const proven = r.steps.find((s) => s.link === "proven")!;
  assert.equal(proven.state, "na");
  assert.match(proven.detail ?? "", /still being built/i);
});

test("a Receptionist on somebody with no line of their own is caught", () => {
  const r = find(
    assess(
      facts({
        sold: ["web", "sms"],
        receptionistAllowed: true,
        people: [{ name: "Aisha", voiceOn: true, hasOwnLine: false }],
        connected: { sms: 1 },
      }),
    ),
    "receptionist",
  );
  assert.equal(r.stuckAt, "connected");
  assert.match(r.because ?? "", /nothing for it to answer/i);
});

test("sold and switched on for nobody is said plainly", () => {
  const r = find(assess(facts({ receptionistAllowed: true })), "receptionist");
  assert.equal(r.stuckAt, "on");
  assert.match(r.because ?? "", /nobody has it switched on/i);
});

/*
 * Willow's real state, which is what started all of this: reminders written,
 * and some people's clients getting none.
 */
test("reminders written but not covering everybody is a break, not a tick", () => {
  const r = find(
    assess(facts({ reminderTemplates: 2, uncovered: ["Mo", "Priya"], ever: { reminderSent: true } })),
    "reminders",
  );
  assert.equal(r.stuckAt, "on");
  assert.match(r.because ?? "", /send nothing at all/i);
});

test("a thing with nothing to switch on is not stuck at the switch", () => {
  const pay = find(assess(facts({ stripeReady: true, ever: { paymentTaken: true } })), "payments");
  assert.equal(pay.stuckAt, null);
  assert.equal(pay.steps.find((s) => s.link === "on")!.state, "na");
});

test("every broken thing offers somewhere to go", () => {
  for (const t of assess(facts({ sold: ["web", "sms", "voice", "email"], marketingSold: true }))) {
    if (t.stuckAt) assert.ok(t.fix?.href.startsWith("/settings"), `${t.key} has nowhere to go`);
  }
});

test("the line at the top counts what matters", () => {
  const allWell = assess(
    facts({
      stripeReady: true,
      hasConfirmation: true,
      reminderTemplates: 1,
      reviewLink: true,
      savedMessages: 1,
      connected: { web: 1 },
      ever: {
        webChat: true,
        paymentTaken: true,
        confirmationSent: true,
        reminderSent: true,
        reviewAsked: true,
        messageByHand: true,
      },
    }),
  );
  assert.match(summarise(allWell), /set up and has been used/);

  assert.match(summarise(assess(nothing)), /need something before/);
});

/*
 * The second half of what Giles asked for: where everything is located.
 * Knowing a thing is broken is no help if changing it means guessing which
 * screen, so every row carries its own map whether or not it is working.
 */
test("every thing says where it is controlled", () => {
  for (const t of assess(
    facts({ sold: ["web", "sms", "voice", "email"], receptionistAllowed: true, marketingSold: true }),
  )) {
    assert.ok(t.where.length > 0, `${t.key} says nowhere`);
    for (const w of t.where) {
      assert.ok(["us", "owner", "person"].includes(w.who), `${t.key} has a bad owner`);
      assert.ok(w.href.startsWith("/"), `${t.key} has a bad link`);
      assert.ok(w.what.length > 5, `${t.key} does not say what is set there`);
    }
  }
});

/*
 * The Receptionist is the one set in all three places, and it is the one that
 * was broken precisely because nothing said so.
 */
test("the Receptionist names all three levels", () => {
  const r = assess(facts({ receptionistAllowed: true })).find((t) => t.key === "receptionist")!;
  assert.deepEqual(
    r.where.map((w) => w.who),
    ["us", "owner", "person"],
  );
});

/*
 * A red link above a green one is not always a contradiction, and payments is
 * where it happens: money going through is a fact about the past, a connected
 * account is a fact about now. The first version showed both with nothing to
 * explain it, which reads as the page being broken rather than the setup.
 */
test("money taken but no account connected now is explained, not left looking wrong", () => {
  const pay = find(assess(facts({ ever: { paymentTaken: true } })), "payments");
  assert.equal(pay.stuckAt, "connected");
  assert.match(pay.because ?? "", /gone through before/i);
  assert.match(pay.because ?? "", /disconnected|expired/i);
});

/* ───────────────────────────── the people half ───────────────────────────── */

import { assessPeople, summarisePeople, type PersonFacts } from "./working.ts";

const person = (over: Partial<PersonFacts> = {}): PersonFacts => ({
  name: "Sarah",
  active: true,
  isResource: false,
  ownerManaged: false,
  hasLogin: true,
  invited: true,
  hasRate: true,
  ownReminders: false,
  sendsNothing: false,
  ownChannelsAllowed: [],
  ownChannelsConnected: [],
  receptionistOn: false,
  hasOwnLine: false,
  takesBookings: true,
  calendarError: null,
  ...over,
});

const says = (p: PersonFacts) => assessPeople([p])[0].notes.map((n) => n.says).join(" ");

test("somebody fully set up has nothing said about them", () => {
  assert.deepEqual(assessPeople([person()])[0].notes, []);
});

test("somebody who has left is not listed", () => {
  assert.deepEqual(assessPeople([person({ active: false })]), []);
});

/*
 * A chair is not a person. Everything here asks about somebody who works, and
 * a room with no login is not a problem to solve.
 */
test("a room or a chair is not asked any of it", () => {
  assert.deepEqual(assessPeople([person({ isResource: true, hasLogin: false, hasRate: false })])[0].notes, []);
});

/*
 * The one that matters most, and the exact state Willow was in: reminders on,
 * none written, clients reminded of nothing.
 */
test("sending nothing is a fault and says which kind", () => {
  const own = assessPeople([person({ sendsNothing: true, ownReminders: true })])[0];
  assert.equal(own.notes[0].kind, "fault");
  assert.match(own.notes[0].says, /has not written any/);

  const shop = assessPeople([person({ sendsNothing: true })])[0];
  assert.match(shop.notes[0].says, /sent nothing before an appointment/);
});

test("a Receptionist with no line is a fault, and says it is still charged", () => {
  const out = says(person({ receptionistOn: true, hasOwnLine: false }));
  assert.match(out, /nothing for it to answer/);
  assert.match(out, /still charged/);
});

test("a Receptionist with a line of their own is fine", () => {
  assert.deepEqual(assessPeople([person({ receptionistOn: true, hasOwnLine: true })])[0].notes, []);
});

/*
 * Never invited and never signed in are different problems with different
 * answers. Telling somebody to chase an invitation that was never sent wastes
 * their afternoon.
 */
test("never invited and never signed in are told apart", () => {
  const never = assessPeople([person({ hasLogin: false, invited: false })])[0];
  assert.equal(never.notes[0].kind, "fault");
  assert.match(never.notes[0].says, /never been invited/);

  const waiting = assessPeople([person({ hasLogin: false, invited: true })])[0];
  assert.equal(waiting.notes[0].kind, "note");
  assert.match(waiting.notes[0].says, /never signed in/);
});

/* Somebody the owner fills in has no login by design, so it is not a fault. */
test("an owner-managed person is not chased for a login", () => {
  assert.deepEqual(assessPeople([person({ hasLogin: false, invited: false, ownerManaged: true })])[0].notes, []);
});

test("a calendar that is failing is a fault, because it double-books them", () => {
  const out = assessPeople([person({ calendarError: "404 from Google" })])[0];
  assert.equal(out.notes[0].kind, "fault");
  assert.match(out.notes[0].says, /double-book/);
});

test("allowed a channel with nothing on it is a note, not a fault", () => {
  const out = assessPeople([person({ ownChannelsAllowed: ["instagram"], ownChannelsConnected: [] })])[0];
  assert.equal(out.notes[0].kind, "note");
  assert.match(out.notes[0].says, /nothing is connected/);
});

test("a choice the owner made is a note rather than a fault", () => {
  const out = assessPeople([person({ takesBookings: false })])[0];
  assert.equal(out.notes[0].kind, "note");
});

test("the people line names who needs fixing", () => {
  const states = assessPeople([
    person({ name: "Aisha", sendsNothing: true, ownReminders: true }),
    person({ name: "Mo" }),
  ]);
  assert.match(summarisePeople(states), /Aisha has something that needs fixing/);
  assert.match(summarisePeople(assessPeople([person()])), /All 1 are set up/);
  assert.equal(summarisePeople([]), "Nobody in the diary yet.");
});

test("whoever needs something is listed first", () => {
  const out = assessPeople([
    person({ name: "Zoe" }),
    person({ name: "Mo", takesBookings: false }),
    person({ name: "Aisha", sendsNothing: true }),
  ]).map((p) => p.name);
  assert.deepEqual(out, ["Aisha", "Mo", "Zoe"]);
});

test("several channels read as a list, not as a chain of ands", () => {
  const out = assessPeople([
    person({ ownChannelsAllowed: ["email", "instagram", "voice"], ownChannelsConnected: [] }),
  ])[0].notes[0].says;
  assert.match(out, /email, instagram and voice/);
  assert.ok(!out.includes("and instagram and"));
});
