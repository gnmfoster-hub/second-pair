import { test } from "node:test";
import assert from "node:assert/strict";
import { wordsFor, plural } from "./words.ts";
import { VERTICAL_LIST } from "./verticals.ts";

test("plurals come out as people say them", () => {
  assert.equal(plural("client"), "clients");
  assert.equal(plural("patient"), "patients");
  assert.equal(plural("pupil"), "pupils");
  assert.equal(plural("owner"), "owners");
  assert.equal(plural("business"), "businesses");
  assert.equal(plural("delivery"), "deliveries");
});

test("a tutor's customers are students, a physio's are patients", () => {
  assert.equal(wordsFor({ vertical: "tutor" }).customers, "students");
  assert.equal(wordsFor({ vertical: "physio" }).customers, "patients");
});

test("the business's own words win over the trade's", () => {
  const w = wordsFor({ vertical: "salon", vocabulary: { practitioner: "barber", customer: "" } });
  assert.equal(w.practitioner, "barber");
  // A blank override is not a word.
  assert.equal(w.customer, "client");
});

test("an unknown trade falls back to neutral words rather than a tattoo studio's", () => {
  const w = wordsFor({ vertical: "nonsense" });
  assert.equal(w.service, "appointment");
  assert.doesNotMatch(JSON.stringify(w), /tattoo|ink|needle|stylist|shampoo/i);
});

/*
 * The point of the whole thing: no trade is shown another trade's examples.
 * Tattoo words belong to tattoo; hair words to hair and beauty.
 */
for (const pack of VERTICAL_LIST) {
  test(`${pack.id} is shown its own kind of examples`, () => {
    const w = wordsFor({ vertical: pack.id });
    const shown = [w.exampleProduct, w.exampleSupplies, w.examplePrice, w.exampleService].join(" | ");
    if (pack.id !== "tattoo") assert.doesNotMatch(shown, /\bink\b|needle|tattoo|aftercare balm/i, shown);
    if (pack.category !== "Hair and beauty") assert.doesNotMatch(shown, /shampoo, 250ml|colour stock|order blades|gel stock|cuticle/i, shown);
  });
}
