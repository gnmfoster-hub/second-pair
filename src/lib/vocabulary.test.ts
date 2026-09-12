import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeVocabulary } from "./vocabulary.ts";

const OWNED = ["practitioner", "practitioners", "customer", "business"] as const;
const PACK = {
  practitioner: "stylist",
  practitioners: "stylists",
  customer: "client",
  business: "salon",
  service: "appointment",
  service_verb: "done",
  size_unit: "service",
};

/*
 * The bug this file exists for.
 *
 * Every real business stores service, service_verb and size_unit, and none of
 * them appears on the form. Replacing the object rather than merging deleted
 * all three the first time anybody opened the business settings and pressed
 * Save without touching a thing.
 */
test("words the form does not offer survive a save", () => {
  const out = mergeVocabulary({
    typed: { practitioner: "barber" },
    owned: OWNED,
    pack: PACK,
    stored: { service: "cut", service_verb: "cut", size_unit: "length", practitioner: "artist" },
  });

  assert.equal(out.service, "cut");
  assert.equal(out.service_verb, "cut");
  assert.equal(out.size_unit, "length");
  assert.equal(out.practitioner, "barber", "the one the form owns did change");
});

test("emptying a box drops the override rather than storing nothing", () => {
  const out = mergeVocabulary({
    typed: { practitioner: "" },
    owned: OWNED,
    pack: PACK,
    stored: { practitioner: "artist", service: "tattoo" },
  });

  assert.equal("practitioner" in out, false);
  assert.equal(out.service, "tattoo", "and it left the rest alone");
});

test("typing the trade's own word back in is not an override", () => {
  const out = mergeVocabulary({
    typed: { practitioner: "Stylist" },
    owned: OWNED,
    pack: PACK,
    stored: { practitioner: "artist" },
  });

  assert.equal("practitioner" in out, false, "matched the pack, case aside");
});

test("a business that has overridden nothing stores nothing", () => {
  const out = mergeVocabulary({
    typed: { practitioner: "stylist", customer: "client" },
    owned: OWNED,
    pack: PACK,
    stored: {},
  });

  assert.deepEqual(out, {});
});
