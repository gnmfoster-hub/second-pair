import { test } from "node:test";
import assert from "node:assert/strict";
import { findSettings, SETTINGS } from "./settingsSearch.ts";

const labels = (q: string, owner = true) =>
  findSettings(q, { owner }).map((s) => s.label);

/*
 * The question that started it: where do I change the deposit.
 */
test("it finds a setting by the word somebody would use", () => {
  assert.ok(labels("deposit").includes("Deposits"));
  assert.ok(labels("cancel").includes("Cancellation policy"));
  assert.ok(labels("stripe").includes("Getting paid"));
});

/*
 * Nobody types the name we chose. They type what the thing does.
 */
test("it finds things by what they are for, not only by their name", () => {
  assert.ok(labels("no show").some((l) => l.includes("Reminders")));
  assert.ok(labels("answerphone").includes("Voicemail response"));
  assert.ok(labels("chat bubble").includes("For your website"));
  assert.ok(labels("gdpr").includes("How long enquiries are kept"));
});

/*
 * The two telephone products are the pair most easily confused, and the search
 * has to separate them rather than offer both for either word.
 */
test("the two telephone add-ons are told apart", () => {
  assert.ok(labels("receptionist").includes("Receptionist"));
  assert.ok(labels("voicemail").includes("Voicemail response"));
});

test("a name match beats a keyword match", () => {
  assert.equal(labels("review")[0], "Review requests");
});

/*
 * An empty box is not a request for the whole list — the rail is already that.
 */
test("nothing typed finds nothing", () => {
  assert.deepEqual(findSettings(""), []);
  assert.deepEqual(findSettings(" "), []);
  assert.deepEqual(findSettings("a"), []);
});

test("something nobody has finds nothing rather than guessing", () => {
  assert.deepEqual(findSettings("helicopter"), []);
});

/*
 * Staff see their own settings and not the business's. Offering somebody a
 * page they will be refused is worse than not offering it.
 */
test("staff are not shown the owner's settings", () => {
  assert.deepEqual(labels("deposit", false), []);
  assert.ok(labels("hours", false).includes("Your hours and rates"));
});

test("the list stays short enough to read", () => {
  assert.ok(findSettings("e").length <= 8);
  assert.ok(findSettings("a e i o u".slice(0, 2)).length <= 8);
});

/*
 * Every entry must point at a page that exists. A search that sends somebody
 * to a screen we never built is worse than no search.
 */
test("every entry points at a settings page", () => {
  for (const s of SETTINGS) {
    assert.match(s.href, /^\/settings(\/[a-z]+)?$/, `${s.label} points at ${s.href}`);
    assert.ok(s.label.trim().length > 2, `${s.label} needs a real label`);
    assert.ok(s.keywords === s.keywords.toLowerCase(), `${s.label} keywords must be lower case`);
  }
});
