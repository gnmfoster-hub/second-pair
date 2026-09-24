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
