import { test } from "node:test";
import assert from "node:assert/strict";
import { tradingName, tradesOwn } from "./tradingName.ts";

const salon = { name: "Willow & Co" };

test("the salon's name, when nobody has said otherwise", () => {
  assert.equal(tradingName(salon, null), "Willow & Co");
  assert.equal(tradingName(salon, {}), "Willow & Co");
  assert.equal(tradingName(salon, { trading_name: null }), "Willow & Co");
});

test("hers, on her own channel", () => {
  assert.equal(
    tradingName(salon, { trading_name: "Hair by Aisha at Willow & Co" }),
    "Hair by Aisha at Willow & Co",
  );
});

/*
 * A box somebody cleared and saved means "use the salon's". Storing the empty
 * string and reading it back would otherwise have the assistant answering for
 * nothing at all.
 */
test("a cleared box means the salon's, not nothing", () => {
  assert.equal(tradingName(salon, { trading_name: "" }), "Willow & Co");
  assert.equal(tradingName(salon, { trading_name: "   " }), "Willow & Co");
});

test("there is always something true to say", () => {
  assert.equal(tradingName(null, null), "this business");
  assert.equal(tradingName({ name: "" }, {}), "this business");
});

/*
 * Trading as yourself is a different fact from having a name, and it changes
 * what else the assistant should say: somebody trading as themselves is the
 * business as far as that customer is concerned.
 */
test("whether she trades as herself is a separate question", () => {
  assert.equal(tradesOwn(salon, { trading_name: "Hair by Aisha" }), true);
  assert.equal(tradesOwn(salon, null), false);
  assert.equal(tradesOwn(salon, { trading_name: "" }), false);
  // Typed the salon's own name in: not a separate trading identity.
  assert.equal(tradesOwn(salon, { trading_name: "Willow & Co" }), false);
});
