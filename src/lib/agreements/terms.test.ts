import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTerms, TERMS_VERSION, type Money } from "./terms.ts";

const base: Money = {
  setupFeePence: 25000,
  recurringPence: 2000,
  period: "monthly",
  trialEndsOn: null,
  noticeDays: 60,
  includes: ["the assistant"],
};

test("the money is said plainly and early", () => {
  const t = buildTerms("Amber's Paws & Pastures", base);
  assert.match(t, /Setting up: £250, once/);
  assert.match(t, /Then: £20 a month/);
  /* Before the clause about ending it, because that is the order it is read. */
  assert.ok(t.indexOf("WHAT IT COSTS") < t.indexOf("ENDING IT"));
});

test("no set-up fee says so rather than saying nothing", () => {
  const t = buildTerms("Neat & Tidy", { ...base, setupFeePence: 0 });
  assert.match(t, /Setting up: nothing\./);
});

test("pence are shown when there are pence", () => {
  assert.match(buildTerms("X", { ...base, recurringPence: 2250 }), /£22\.50 a month/);
  assert.match(buildTerms("X", { ...base, recurringPence: 2000 }), /£20 a month/);
});

test("a trial is named with its date, and says what happens if they stop", () => {
  const t = buildTerms("X", { ...base, trialEndsOn: "2026-12-01" });
  assert.match(t, /2026-12-01/);
  assert.match(t, /pay nothing further/);
});

test("no trial says nothing about one", () => {
  assert.doesNotMatch(buildTerms("X", base), /trial|until 20/i);
});

test("the notice period is whatever the agreement says", () => {
  assert.match(buildTerms("X", base), /60 days' notice/);
  assert.match(buildTerms("X", { ...base, noticeDays: 30 }), /30 days' notice/);
});

test("what they bought is listed in English", () => {
  assert.match(buildTerms("X", { ...base, includes: ["a website"] }), /taking on a website\./);
  assert.match(
    buildTerms("X", { ...base, includes: ["the assistant", "a website"] }),
    /the assistant and a website/,
  );
  assert.match(
    buildTerms("X", { ...base, includes: ["the assistant", "a website", "the Receptionist"] }),
    /the assistant, a website and the Receptionist/,
  );
});

/*
 * A website-only client is a real thing Giles asked for, and the document has
 * to read properly for one rather than mentioning an assistant they have not
 * bought.
 */
test("a website-only agreement does not promise an assistant", () => {
  const t = buildTerms("X", { ...base, includes: ["a website"] });
  assert.match(t, /taking on a website/);
  assert.doesNotMatch(t.split("1. WHAT YOU ARE GETTING")[1].split("2.")[0], /assistant/i);
});

/*
 * The clause that is actually compulsory, and the one most likely to be
 * skipped. UK GDPR Article 28 requires the processor arrangement in writing.
 */
test("the data processing agreement says the things it has to say", () => {
  const t = buildTerms("X", base);
  assert.match(t, /you are the controller of that information and we are your processor/);
  assert.match(t, /only on your instructions/);
  assert.match(t, /duty of confidence/);
  assert.match(t, /without undue delay if that information is ever exposed/);
  assert.match(t, /delete or return it when this agreement ends/);
  assert.match(t, /tell you before adding another/);
});

test("ICO registration is said to be theirs, with where to check", () => {
  const t = buildTerms("X", base);
  /* No /s flag: the target predates it, and the two facts are on one line. */
  assert.match(t, /Information Commissioner's Office[^\n]*is yours rather than ours/);
  assert.match(t, /ico\.org\.uk/);
});

test("liability is capped but never for injury or fraud", () => {
  const t = buildTerms("X", base);
  assert.match(t, /limited to what you have paid us/);
  assert.match(t, /death or personal injury caused by negligence, or for fraud/);
});

test("it says they can take their data with them", () => {
  assert.match(buildTerms("X", base), /at no charge/);
});

test("every clause a solicitor must look at is marked", () => {
  const t = buildTerms("X", base);
  /* Money changes, liability, notice, the DPA, and ICO registration. */
  assert.ok((t.match(/★/g) ?? []).length >= 5, "the marks are how a review finds them");
});

test("the version is stamped so it is always knowable what was signed", () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-/);
});
