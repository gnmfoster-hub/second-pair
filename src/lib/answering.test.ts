import { test } from "node:test";
import assert from "node:assert/strict";
import { whoAnswers, untilEndOfDay, type AnsweringMode } from "./answering.ts";
import type { Channel } from "./types.ts";

const NOW = new Date("2026-09-02T14:00:00Z");

function ask(over: Partial<Parameters<typeof whoAnswers>[0]> = {}) {
  return whoAnswers({
    channel: "sms" as Channel,
    now: NOW,
    mode: "when_free" as AnsweringMode,
    mineUntil: null,
    outOfHours: false,
    withAClient: false,
    firstRefusalMinutes: 5,
    ...over,
  });
}

// -------------------------------------------------- somebody sitting watching

test("a website chat is always answered at once", () => {
  // They typed a question and are looking at the box. Every other rule loses.
  for (const mode of ["always", "when_free", "always_ask_me"] as AnsweringMode[]) {
    const d = ask({ channel: "web", mode, outOfHours: true, withAClient: true });
    assert.equal(d.answer, true);
    assert.equal(d.answer && d.because, "live");
  }
});

test("a live channel beats even an explicit hold", () => {
  // Holding here is not discretion, it is a website that looks broken.
  const mine = new Date(NOW.getTime() + 60 * 60_000);
  assert.equal(ask({ channel: "web", mineUntil: mine }).answer, true);
});

// ------------------------------------------------------- the manual override

test("I've got this holds until it runs out, and no longer", () => {
  const mine = new Date(NOW.getTime() + 90 * 60_000);
  const d = ask({ mineUntil: mine });
  assert.equal(d.answer, false);
  assert.equal(d.answer === false && d.holdUntil.getTime(), mine.getTime());
  assert.equal(d.answer === false && d.because, "owner_asked");
});

test("an expired override is no override", () => {
  const mine = new Date(NOW.getTime() - 60_000);
  const d = ask({ mineUntil: mine, mode: "always" });
  assert.equal(d.answer, true);
});

test("an explicit hold beats what the diary thinks", () => {
  // Second-guessing a deliberate press — "you say you have it, but you look
  // busy" — is software arguing with its owner.
  const mine = new Date(NOW.getTime() + 30 * 60_000);
  const d = ask({ mineUntil: mine, withAClient: true, outOfHours: true });
  assert.equal(d.answer, false);
  assert.equal(d.answer === false && d.because, "owner_asked");
});

// -------------------------------------------------------------- always mode

test("always answers regardless of hours or diary", () => {
  assert.equal(ask({ mode: "always" }).answer, true);
  assert.equal(ask({ mode: "always", outOfHours: true }).answer, true);
  assert.equal(ask({ mode: "always", withAClient: true }).answer, true);
});

// ------------------------------------------------------------ when_free mode

test("when free and working, the owner gets first refusal", () => {
  const d = ask();
  assert.equal(d.answer, false);
  assert.equal(d.answer === false && d.because, "first_refusal");
  assert.equal(
    d.answer === false && d.holdUntil.getTime(),
    NOW.getTime() + 5 * 60_000,
  );
});

test("shut, or mid-appointment, the assistant takes it", () => {
  // Hands provably full: a head start nobody can use is only a delay.
  assert.equal(ask({ outOfHours: true }).answer, true);
  assert.equal(ask({ outOfHours: true }).answer && ask({ outOfHours: true }).because, "out_of_hours");
  assert.equal(ask({ withAClient: true }).answer, true);
});

// -------------------------------------------------------- always_ask_me mode

test("always_ask_me wants the evening ones too", () => {
  // A one-person business that would rather answer a Sunday message itself.
  const d = ask({ mode: "always_ask_me", outOfHours: true });
  assert.equal(d.answer, false);
  assert.equal(d.answer === false && d.because, "first_refusal");
});

test("always_ask_me still hands over when the head start runs out", () => {
  // The whole point: choosing this cannot turn into silence.
  const d = ask({ mode: "always_ask_me", outOfHours: true, withAClient: true });
  assert.equal(d.answer, false);
  assert.ok(d.answer === false && d.holdUntil > NOW);
});

// ------------------------------------------------- silence is always bounded

test("no combination of settings produces an unbounded wait", () => {
  const modes: AnsweringMode[] = ["always", "when_free", "always_ask_me"];
  const channels: Channel[] = ["sms", "whatsapp", "instagram", "messenger", "email", "web"];

  for (const mode of modes) {
    for (const channel of channels) {
      for (const outOfHours of [true, false]) {
        for (const withAClient of [true, false]) {
          for (const mineUntil of [null, new Date(NOW.getTime() + 4 * 3600_000)]) {
            const d = whoAnswers({
              channel,
              now: NOW,
              mode,
              mineUntil,
              outOfHours,
              withAClient,
              firstRefusalMinutes: 5,
            });
            if (d.answer) continue;
            assert.ok(
              d.holdUntil > NOW,
              `${mode}/${channel} produced a hold that is not in the future`,
            );
            assert.ok(
              d.holdUntil.getTime() - NOW.getTime() <= 4 * 3600_000,
              `${mode}/${channel} would hold longer than the override itself`,
            );
          }
        }
      }
    }
  }
});

test("a nonsense head start cannot switch the assistant off", () => {
  // A zero makes the mode meaningless; a huge number is an off switch wearing
  // a disguise, which is the thing this file exists to prevent.
  const none = ask({ firstRefusalMinutes: 0 });
  assert.equal(
    none.answer === false && none.holdUntil.getTime(),
    NOW.getTime() + 60_000,
  );

  const silly = ask({ firstRefusalMinutes: 100_000 });
  assert.equal(
    silly.answer === false && silly.holdUntil.getTime(),
    NOW.getTime() + 60 * 60_000,
  );
});

// ------------------------------------------------------------ the day's edge

test("an override cannot outlive the day it was set", () => {
  const afternoon = new Date("2026-09-02T13:00:00");
  assert.ok(untilEndOfDay(afternoon) > afternoon);
  assert.equal(untilEndOfDay(afternoon).getHours(), 20);
});

test("set late, it still gives an hour rather than a time already gone", () => {
  const nearMidnight = new Date("2026-09-02T23:30:00");
  const until = untilEndOfDay(nearMidnight);
  assert.ok(until > nearMidnight);
  assert.equal(until.getTime(), nearMidnight.getTime() + 3600_000);
});
