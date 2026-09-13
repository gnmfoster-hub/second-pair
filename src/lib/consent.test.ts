import { test } from "node:test";
import assert from "node:assert/strict";
import { consentPatch, describeConsent } from "./consent.ts";

const NOW = new Date("2026-09-14T10:00:00Z");

test("ticking it records when and who", () => {
  const p = consentPatch(true, null, "ticked by Sarah", NOW);
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
