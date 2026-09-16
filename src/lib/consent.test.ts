import { test } from "node:test";
import assert from "node:assert/strict";
import { consentPatch, describeConsent, mayMarket, marketingPatch, marketingChoiceOf } from "./consent.ts";

const NOW = new Date("2026-09-14T10:00:00Z");

test("ticking it records when and who", () => {
  const p = consentPatch(true, null, "ticked by Sarah", true, NOW);
  assert.equal(p.marketing_consent, true);
  assert.equal(p.marketing_consent_at, "2026-09-14T10:00:00.000Z");
  assert.equal(p.marketing_consent_source, "ticked by Sarah");
});

/*
 * The one that would quietly forge the evidence. Somebody edits a phone number
 * on a record whose box was ticked two years ago; restamping would turn an old
 * agreement into a fresh-looking one every time anybody touched the record.
 */
test("re-saving an already evidenced consent leaves the date alone", () => {
  const p = consentPatch(
    true,
    { marketing_consent: true, marketing_consent_at: "2024-01-05T09:00:00.000Z" },
    "ticked by Mo",
    true,
    NOW,
  );
  assert.equal(p.marketing_consent, true);
  assert.equal(p.marketing_consent_at, undefined);
  assert.equal(p.marketing_consent_source, undefined);
});

/* A tick from before this existed has no date, so saving it gives it one. */
test("an undated tick gets evidenced the next time it is confirmed", () => {
  const p = consentPatch(
    true,
    { marketing_consent: true, marketing_consent_at: null },
    "ticked by Mo",
    true,
    NOW,
  );
  assert.equal(p.marketing_consent_at, "2026-09-14T10:00:00.000Z");
});

/*
 * Withdrawing clears the evidence too. Keeping the date of a consent that no
 * longer exists invites somebody to read it as a live one.
 */
test("clearing it wipes the evidence with it", () => {
  const p = consentPatch(
    false,
    { marketing_consent: true, marketing_consent_at: "2024-01-05T09:00:00.000Z" },
    "unticked by Sarah",
    true,
    NOW,
  );
  assert.equal(p.marketing_consent, false);
  assert.equal(p.marketing_consent_at, null);
  assert.equal(p.marketing_consent_source, null);
});

// ─────────────────────────────────────────────────── what the screen says

test("not agreed is said plainly", () => {
  const d = describeConsent({ marketing_consent: false });
  assert.equal(d.evidenced, false);
  assert.match(d.text, /has not agreed/i);
});

/*
 * The state a checkbox cannot show, and the reason this exists: a tick nobody
 * can date is not consent anybody should rely on.
 */
test("a tick with no date says so, and is not counted as evidence", () => {
  const d = describeConsent({ marketing_consent: true, marketing_consent_at: null });
  assert.equal(d.evidenced, false);
  assert.match(d.text, /nobody recorded when/i);
});

test("an evidenced consent reads as a date and a source", () => {
  const d = describeConsent({
    marketing_consent: true,
    marketing_consent_at: "2026-09-14T10:00:00.000Z",
    marketing_consent_source: "ticked by Sarah",
  });
  assert.equal(d.evidenced, true);
  assert.match(d.text, /14 September 2026/);
  assert.match(d.text, /ticked by Sarah/);
});

/*
 * The one that broke saving a client for twenty minutes.
 *
 * The code shipped before its migration, so every save wrote two columns that
 * did not exist — and PostgREST rejects the whole update, so saving a client
 * stopped working rather than quietly losing the date.
 */
test("with no evidence columns yet, it writes the tick and nothing else", () => {
  const p = consentPatch(true, null, "ticked by Sarah", false, NOW);
  assert.deepEqual(p, { marketing_consent: true });
});

test("and clearing still works without them", () => {
  const p = consentPatch(false, { marketing_consent: true }, "unticked", false, NOW);
  assert.deepEqual(p, { marketing_consent: false });
});

test("marketing is asked per channel, and a tick from before counts as email", () => {
  assert.equal(mayMarket({ marketing_consent: true, marketing_consent_at: "2026-01-01" }, "email"), true);
  assert.equal(mayMarket({ marketing_consent: true, marketing_consent_at: "2026-01-01" }, "sms"), false);
  assert.equal(
    mayMarket({ marketing_consent: true, marketing_consent_at: "2026-01-01", marketing_email: false, marketing_sms: true }, "email"),
    false,
  );
  assert.equal(
    mayMarket({ marketing_consent: true, marketing_consent_at: "2026-01-01", marketing_email: false, marketing_sms: true }, "sms"),
    true,
  );
});

test("agreed with no date is never marketable", () => {
  assert.equal(mayMarket({ marketing_consent: true, marketing_email: true }, "email"), false);
});

test("turning both off clears the evidence, turning one on stamps it", () => {
  const off = marketingPatch({ email: false, sms: false }, { marketing_consent: true, marketing_consent_at: "2026-01-01" }, "they set it themselves");
  assert.equal(off.marketing_consent, false);
  assert.equal(off.marketing_consent_at, null);
  assert.equal(off.marketing_email, false);

  const on = marketingPatch({ email: true, sms: false }, null, "they set it themselves", true, new Date("2026-09-16T10:00:00Z"));
  assert.equal(on.marketing_consent, true);
  assert.equal(on.marketing_consent_at, "2026-09-16T10:00:00.000Z");
  assert.equal(on.marketing_consent_source, "they set it themselves");
});

test("an existing dated agreement is not restamped by an unrelated save", () => {
  const same = marketingPatch(
    { email: true, sms: true },
    { marketing_consent: true, marketing_consent_at: "2026-01-01T00:00:00.000Z" },
    "the salon",
  );
  assert.equal(same.marketing_consent_at, undefined);
  assert.equal(same.marketing_sms, true);
});
