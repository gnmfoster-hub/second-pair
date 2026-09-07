import { test } from "node:test";
import assert from "node:assert/strict";
import { Limiter, ORDINARY } from "./askingTooMuch.ts";

const IP = "203.0.113.9";

test("an ordinary conversation is never refused", () => {
  const limiter = new Limiter();
  let now = 0;
  // Six messages, a few seconds apart, the way somebody books an appointment.
  for (let i = 0; i < 6; i++) {
    assert.equal(limiter.tooMuch("session-1", IP, now), null, `message ${i}`);
    now += 4000;
  }
});

test("two messages in the same instant are too fast", () => {
  const limiter = new Limiter();
  assert.equal(limiter.tooMuch("s", IP, 0), null);
  assert.equal(limiter.tooMuch("s", IP, 500), "too fast");
});

/*
 * The hole this exists to close. The session is a string the caller invents,
 * so a new one each time walked straight past the old per-session gap.
 */
test("a new session every time does not buy an unlimited budget", () => {
  const limiter = new Limiter();
  let now = 0;
  let refused = 0;
  for (let i = 0; i < 60; i++) {
    if (limiter.tooMuch(`made-up-${i}`, IP, now)) refused++;
    now += 2000;
  }
  assert.ok(refused > 0, "a script changing session each time was never refused");
  assert.equal(refused, 60 - ORDINARY.perAddress);
});

test("the budget frees up again once the window has passed", () => {
  const limiter = new Limiter();
  let now = 0;
  for (let i = 0; i < ORDINARY.perAddress; i++) {
    limiter.tooMuch(`x-${i}`, IP, now);
    now += 2000;
  }
  assert.equal(limiter.tooMuch("x-next", IP, now), "too many");
  assert.equal(limiter.tooMuch("x-later", IP, now + ORDINARY.windowMs + 1), null);
});

test("two different people are not charged to each other", () => {
  const limiter = new Limiter();
  let now = 0;
  for (let i = 0; i < ORDINARY.perAddress; i++) {
    limiter.tooMuch(`a-${i}`, "198.51.100.1", now);
    now += 2000;
  }
  assert.equal(limiter.tooMuch("b", "198.51.100.2", now), null);
});

/*
 * Behind some proxies there is no address to read. Refusing outright would
 * turn a header problem into a widget that answers nobody.
 */
test("no address falls back to the pace limit rather than refusing", () => {
  const limiter = new Limiter();
  assert.equal(limiter.tooMuch("s", "", 0), null);
  assert.equal(limiter.tooMuch("s", "", 500), "too fast");
  assert.equal(limiter.tooMuch("s", "", 5000), null);
});
