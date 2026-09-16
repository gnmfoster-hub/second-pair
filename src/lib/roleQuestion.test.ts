import { test } from "node:test";
import assert from "node:assert/strict";
import { askAboutRole } from "./roleQuestion.ts";
import { VERTICAL_LIST, verticalPack } from "./verticals.ts";

test("it asks about the specialist, not about everybody", () => {
  assert.equal(askAboutRole(["Technician", "MOT tester", "Bodywork"], "technician"), "who is your mot tester?");
  assert.equal(
    askAboutRole(["Electrician", "Approved electrician", "Apprentice"], "electrician"),
    "who is your apprentice?",
    "an approved electrician is still an electrician; an apprentice is the one worth asking about",
  );
  assert.equal(askAboutRole(["Stylist", "Colourist", "Senior stylist"], "stylist"), "who is your colourist?");
});

test("one role, or none, is not an error", () => {
  assert.equal(askAboutRole(["Cleaner"], "cleaner"), "who is your cleaner?");
  assert.equal(askAboutRole([], "plumber"), null);
  assert.equal(askAboutRole(["  "], "plumber"), null);
});

/*
 * The fault this exists for: every trade was shown a garage's question. So the
 * test is not that one trade reads well — it is that no trade is shown
 * somebody else's words.
 */
test("no trade is ever shown another trade's example", () => {
  for (const { id } of VERTICAL_LIST) {
    const pack = verticalPack(id);
    const asked = askAboutRole(pack.roles, pack.vocabulary.practitioner);
    assert.ok(asked, `${id} has no example question`);
    assert.ok(!/mot/i.test(asked) || id === "garage" || id === "mobile_mechanic", `${id} is asking about MOTs`);
    assert.match(asked, /^who is your .+\?$/, `${id}: ${asked}`);
  }
});
