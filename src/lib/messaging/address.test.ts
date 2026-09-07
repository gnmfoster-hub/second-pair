import { test } from "node:test";
import assert from "node:assert/strict";
import { addressOf, domainOf, senderLine } from "./address.ts";

test("an address written with a name in front of it", () => {
  assert.equal(addressOf("Second Pair <hello@second-pair.com>"), "hello@second-pair.com");
  assert.equal(addressOf("hello@second-pair.com"), "hello@second-pair.com");
  assert.equal(domainOf("Second Pair <hello@second-pair.com>"), "second-pair.com");
  assert.equal(domainOf("nonsense"), "");
});

test("the business's name goes over our address, not round the whole line", () => {
  assert.equal(
    senderLine("Second Pair <hello@second-pair.com>", "Living Canvas Tattoo"),
    "Living Canvas Tattoo <hello@second-pair.com>",
  );
  assert.equal(
    senderLine("hello@second-pair.com", "Living Canvas Tattoo"),
    "Living Canvas Tattoo <hello@second-pair.com>",
  );
});

test("with no business name the setting is used as it was written", () => {
  assert.equal(
    senderLine("Second Pair <hello@second-pair.com>"),
    "Second Pair <hello@second-pair.com>",
  );
  assert.equal(senderLine("hello@second-pair.com", "   "), "hello@second-pair.com");
});

test("a name that would break the header cannot", () => {
  assert.equal(
    senderLine("hello@second-pair.com", 'Bella"s <Salon>'),
    "Bellas Salon <hello@second-pair.com>",
  );
});

test("a name that is nothing but punctuation leaves the address alone", () => {
  assert.equal(senderLine("hello@second-pair.com", "<<>>"), "hello@second-pair.com");
});
