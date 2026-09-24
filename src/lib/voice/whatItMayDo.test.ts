import { test } from "node:test";
import assert from "node:assert/strict";
import { onTheCall, whatToSay, heldUntil, HELD_HOURS, type Settings } from "./whatItMayDo.ts";

const sold = (over: Partial<Settings> = {}): Settings => ({
  allowed: true,
  on: true,
  holds: true,
  asksDeposit: false,
  ...over,
});

/*
 * Refusing is the common answer: almost nobody has this, and a line that tries
 * to talk when it has not been sold the ability is worse than one that texts
 * back the way it always did.
 */
test("it does not answer where it has not been sold or switched on", () => {
  assert.deepEqual(onTheCall(sold({ allowed: false })), {
    answer: false,
    because: "not on this plan",
  });
  assert.deepEqual(onTheCall(sold({ on: false })), {
    answer: false,
    because: "not switched on for this line",
  });
});

test("by default it books, and the booking waits for a person", () => {
  const out = onTheCall(sold());
  assert.equal(out.answer && out.mayBook, true);
  assert.equal(out.answer && out.landsAs, "held");
});

test("a business that trusts it can have bookings land confirmed", () => {
  const out = onTheCall(sold({ holds: false }));
  assert.equal(out.answer, true);
  assert.equal(out.answer && out.landsAs, "booked");
});

/*
 * The one thing on this call that reaches into somebody's bank account. A
 * deposit request for an appointment nobody has checked is the wrong order,
 * whatever the business has ticked.
 */
test("it never asks for a deposit on a booking nobody has checked", () => {
  const held = onTheCall(sold({ holds: true, asksDeposit: true }));
  assert.equal(held.answer && held.mayAskDeposit, false);

  const confirmed = onTheCall(sold({ holds: false, asksDeposit: true }));
  assert.equal(confirmed.answer && confirmed.mayAskDeposit, true);
});

test("and not at all unless the business asked for it", () => {
  const out = onTheCall(sold({ holds: false, asksDeposit: false }));
  assert.equal(out.answer && out.mayAskDeposit, false);
});

/*
 * The sentence a customer repeats back to somebody later. It must not promise
 * a confirmed appointment when the diary is holding a pending one.
 */
test("what it says matches what actually happened", () => {
  assert.match(whatToSay(onTheCall(sold()), "Marie"), /text you to confirm/);
  assert.match(whatToSay(onTheCall(sold({ holds: false })), "Marie"), /booked in, Marie/);
  assert.match(
    whatToSay(onTheCall(sold({ holds: false, asksDeposit: true })), "Marie"),
    /link for the deposit/,
  );
});

test("it manages without a name", () => {
  const said = whatToSay(onTheCall(sold()), null);
  assert.ok(!said.includes("null"));
  assert.ok(!said.includes(", ,"));
});

test("a refused call says nothing at all", () => {
  assert.equal(whatToSay(onTheCall(sold({ allowed: false })), "Marie"), "");
});

/*
 * A business is shut at night. A hold that lapses at two in the morning throws
 * away a real booking nobody was ever going to see in time.
 */
test("a phone hold lasts long enough to survive a night", () => {
  assert.ok(HELD_HOURS >= 12, `${HELD_HOURS} hours does not survive being shut`);
  const at = Date.parse(heldUntil(new Date("2026-09-25T18:00:00Z")));
  assert.equal(new Date(at).toISOString(), "2026-09-26T12:00:00.000Z");
});
