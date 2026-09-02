import { test } from "node:test";
import assert from "node:assert/strict";
import { retires, withoutLink } from "./conversationCards.ts";

// ------------------------------------------------------- what replaces what

test("a second card of the same kind replaces the first", () => {
  assert.equal(retires("slots", "slots"), true);
  assert.equal(retires("quote", "quote"), true);
  assert.equal(retires("booked", "booked"), true);
});

test("booking retires the times it was chosen from", () => {
  // The one that matters: without it, four tappable slots sit under a
  // confirmed appointment inviting somebody to book a second time.
  assert.equal(retires("booked", "slots"), true);
});

test("a quote survives everything that follows it", () => {
  // The price is still true after the booking, and it is what people scroll
  // back to check.
  assert.equal(retires("booked", "quote"), false);
  assert.equal(retires("deposit", "quote"), false);
  assert.equal(retires("slots", "quote"), false);
});

test("asking for a deposit does not withdraw the appointment", () => {
  assert.equal(retires("deposit", "booked"), false);
});

test("times do not retire a booking that already happened", () => {
  // Only the newer-retires-older direction is meaningful; the caller never asks
  // the other way round, but answering true here would erase a confirmation.
  assert.equal(retires("slots", "booked"), false);
});

// --------------------------------------------------- the duplicated payment link

const LINK = "https://second-pair.com/pay/66749216-c01f-44c0-9a1f-10dd87a6130b";

test("a link on its own line goes, and the words close up", () => {
  const said = `Here you go, Sam:\n\n${LINK}\n\nThat's the £25 deposit.`;
  assert.equal(withoutLink(said, LINK), "Here you go, Sam:\n\nThat's the £25 deposit.");
});

test("the same link written without its scheme also goes", () => {
  // What the assistant writes and what the bubble renders are not always the
  // same string — the renderer strips the scheme to make it readable.
  const bare = LINK.replace("https://", "");
  const said = `Here you go:\n\n${bare}\n\nHeld until it is paid.`;
  assert.equal(withoutLink(said, LINK), "Here you go:\n\nHeld until it is paid.");
});

test("a link inside a sentence is left alone", () => {
  // Cutting it would leave a hole in something the assistant actually said.
  const said = `Pay at ${LINK} and you are set.`;
  assert.equal(withoutLink(said, LINK), said);
});

test("a different link is left alone", () => {
  const other = "https://second-pair.com/pay/00000000-0000-0000-0000-000000000000";
  const said = `Here:\n\n${other}\n\nThanks.`;
  assert.equal(withoutLink(said, LINK), said);
});

test("removing the line does not leave a gap where it was", () => {
  const said = `One.\n\n${LINK}\n\n\n\nTwo.`;
  assert.equal(withoutLink(said, LINK), "One.\n\nTwo.");
});

test("a reply that was only the link comes back empty rather than blank lines", () => {
  assert.equal(withoutLink(`\n\n${LINK}\n\n`, LINK), "");
});

test("surrounding whitespace on the link's own line does not save it", () => {
  const said = `Here:\n   ${LINK}   \nThanks.`;
  assert.equal(withoutLink(said, LINK), "Here:\nThanks.");
});
