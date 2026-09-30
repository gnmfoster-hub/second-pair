import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTerms, TERMS_VERSION, totalsFor, type Line, type Money } from "./terms.ts";

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

/*
 * ── The priced schedule ─────────────────────────────────────────────────────
 *
 * Giles, 30 Sep: "the agreement isn't very in depth and should really have
 * separate lines to add services and costs etc." A set-up fee and one recurring
 * figure is not a schedule: a real one here is a site built once, an assistant
 * every month, the Receptionist every month, and texts on top.
 */
const RUN: Line[] = [
  { what: "A website", pence: 45000, when: "once" },
  { what: "The assistant", pence: 2000, when: "monthly" },
  { what: "The Receptionist", pence: 1500, when: "monthly" },
];

test("every line is listed with its own price and its own period", () => {
  const t = buildTerms("Amber's Paws", {
    ...base,
    lines: RUN,
    ...totalsFor(RUN),
  });
  assert.match(t, /A website: £450, once/);
  assert.match(t, /The assistant: £20 a month/);
  assert.match(t, /The Receptionist: £15 a month/);
});

test("the totals are the sums of the lines, not a second thing to type", () => {
  const totals = totalsFor(RUN);
  assert.equal(totals.setupFeePence, 45000);
  assert.equal(totals.recurringPence, 3500);
  assert.equal(totals.period, "monthly");

  const t = buildTerms("X", { ...base, lines: RUN, ...totals });
  assert.match(t, /Once, at the start: £450, payable before we start/);
  assert.match(t, /Then: £35 a month/);
});

/*
 * The case that would have been quietly wrong.
 *
 * A monthly assistant and a yearly domain have no single recurring figure, and
 * adding a month to a year to produce one would be the worst kind of mistake:
 * plausible, on a document somebody signs. Each period gets its own sum.
 */
test("lines on different periods are not added together into a fiction", () => {
  const mixed: Line[] = [
    { what: "The assistant", pence: 2000, when: "monthly" },
    { what: "Your domain", pence: 1800, when: "yearly" },
  ];
  const t = buildTerms("X", { ...base, lines: mixed, ...totalsFor(mixed) });
  assert.match(t, /Then: £20 a month and £18 a year\./);
  assert.doesNotMatch(t, /£38/, "a month and a year must never be summed");
});

test("no schedule reads exactly as it always did", () => {
  const without = buildTerms("X", base);
  assert.match(without, /Setting up: £250, once, payable before we start/);
  assert.match(without, /Then: £20 a month/);
  assert.doesNotMatch(without, /What you are paying for/);
});

test("a schedule of one is still a schedule", () => {
  const one: Line[] = [{ what: "A website", pence: 45000, when: "once" }];
  const t = buildTerms("X", { ...base, lines: one, ...totalsFor(one) });
  assert.match(t, /A website: £450, once/);
  /* Nothing recurring, so the "then" line says nought rather than going missing. */
  assert.match(t, /Then: £0 a month/);
});

/*
 * ── Who owns what ───────────────────────────────────────────────────────────
 *
 * The real hole, and the reason this version was bumped. This company builds
 * websites; the marketing pages already promise "your domain, your content, your
 * photographs, if you ever leave it comes with you"; and the agreement said
 * nothing about ownership at all. A promise on a sales page and silence in the
 * contract is the wrong way round, because the sales page is the one nobody reads
 * again.
 */
test("what the client gives us stays theirs, in both directions", () => {
  const t = buildTerms("X", base);
  assert.match(t, /Everything you give us stays yours/);
  assert.match(t, /your domain name/);
  /* And the half that protects the platform: the software is not sold with it. */
  assert.match(t, /the software this all runs on|the software behind it/);
  assert.match(t, /every business here shares and none of them owns/);
});

test("a website-only client is told the site is theirs to take", () => {
  const t = buildTerms("X", { ...base, includes: ["a website"] });
  assert.match(t, /The site we build for you is yours/);
  assert.match(t, /goes with you/);
});

/*
 * The clause that protects us from them, which is the one most likely to be left
 * out because it is the awkward one to write. Somebody hands over a photograph
 * they found on Google, it goes on their site, and the photographer's agent
 * writes to us.
 */
test("material a client supplies has to be theirs to supply", () => {
  const t = buildTerms("X", base);
  assert.match(t, /has to be yours to give/);
  assert.match(t, /for you to settle rather than us/);
  assert.match(t, /take anything down straight away/);
});

test("confidentiality runs both ways and does not gag either of us about working together", () => {
  const t = buildTerms("X", base);
  assert.match(t, /None of it goes anywhere/);
  assert.match(t, /the same applies the other way round/i);
  assert.match(t, /does not stop either of us saying that we work together/);
});

/*
 * Numbering, because a cross-reference to the wrong section is the kind of fault
 * nobody notices until a solicitor does. Two clauses were inserted before "THE
 * REST", and section 2 refers to "the notice period in section 5".
 */
test("the sections are numbered in order and the cross-reference still points at notice", () => {
  const t = buildTerms("X", base);
  const numbers = [...t.matchAll(/^(\d+)\. [A-Z]/gm)].map((m) => Number(m[1]));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.match(t, /the notice period in section 5 does not apply/);
  assert.match(t, /^5\. ENDING IT$/m);
});

test("the version says which wording this is, and it is not the first draft any more", () => {
  assert.equal(TERMS_VERSION, "2026-09-draft-2");
});
