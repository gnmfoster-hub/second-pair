import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanBlocks,
  readAnswers,
  whatIsMissing,
  validSignature,
  answerText,
  flagged,
  detailKey,
  quoteTotal,
  type Block,
} from "./blocks.ts";
import { ALL_STARTERS, startersFor } from "./starters.ts";
import { formNeeded } from "./required.ts";
import { VERTICAL_LIST } from "../verticals.ts";

const SIGNATURE = "data:image/png;base64," + "A".repeat(400);

const form: Block[] = [
  { id: "p", type: "text", label: "Read this" },
  { id: "name", type: "short", label: "Your name", required: true },
  { id: "allergy", type: "yesno", label: "Any allergies?", required: true, detailOnYes: true },
  { id: "use", type: "choice", label: "Photos?", options: ["Yes", "No"], required: true },
  { id: "ok", type: "agree", label: "I agree" },
  { id: "sign", type: "signature", label: "Signature" },
];

const answersFrom = (values: Record<string, string>) => readAnswers(form, (k) => values[k] ?? null);

test("a complete form is accepted", () => {
  const a = answersFrom({ q_name: "Jo", q_allergy: "yes", [`q_${detailKey("allergy")}`]: "latex", q_use: "No", q_ok: "on" });
  assert.deepEqual(whatIsMissing(form, a, { name: "Jo Marsh", signature: SIGNATURE }), []);
  assert.equal(a[detailKey("allergy")], "latex");
  assert.equal(answerText(form[2], a), "Yes — latex");
  assert.equal(answerText(form[4], a), "Agreed");
});

test("what is missing is said in order, in words", () => {
  const missing = whatIsMissing(form, answersFrom({}), { name: "", signature: null });
  assert.deepEqual(missing, [
    "Please answer: Your name",
    "Please answer: Any allergies?",
    "Please answer: Photos?",
    "Tick to agree: I agree",
    "Type your full name under the signature.",
    "Sign in the box, or type your name to sign.",
  ]);
});

test("an answer that is not one of the options is refused", () => {
  const a = answersFrom({ q_name: "Jo", q_allergy: "no", q_use: "Maybe", q_ok: "on" });
  assert.match(whatIsMissing(form, a, { name: "Jo", signature: SIGNATURE }).join(), /Pick one/);
});

test("a submission cannot add answers to questions nobody asked", () => {
  const a = answersFrom({ q_name: "Jo", q_extra: "sneaky" });
  assert.equal("extra" in a, false);
});

test("a signature must be a real drawn image", () => {
  assert.equal(validSignature(SIGNATURE), true);
  assert.equal(validSignature("data:image/png;base64,short"), false);
  assert.equal(validSignature("javascript:alert(1)"), false);
  assert.equal(validSignature("data:image/svg+xml;base64," + "A".repeat(400)), false);
});

test("blocks are cleaned: unknown kinds, blank questions, a second signature, choices with one option", () => {
  const cleaned = cleanBlocks([
    { id: "a", type: "short", label: "  Name  ", required: true },
    { id: "a", type: "long", label: "Same id" },
    { type: "script", label: "<b>nope</b>" },
    { type: "short", label: "   " },
    { type: "choice", label: "One option", options: ["Only"] },
    { type: "text", label: "Paragraph", required: true },
    { type: "signature", label: "" },
    { type: "signature", label: "Second" },
  ]);
  assert.deepEqual(cleaned.map((b) => b.type), ["short", "long", "text", "signature"]);
  assert.equal(cleaned[0].label, "Name");
  assert.notEqual(cleaned[0].id, cleaned[1].id);
  assert.equal(cleaned[2].required, undefined);
  assert.equal(cleaned[3].required, true);
});

test("a yes to a health question is flagged for whoever reads it", () => {
  const a = answersFrom({ q_allergy: "yes" });
  assert.deepEqual(flagged(form, a).map((b) => b.id), ["allergy"]);
});

test("every starter form is valid as it stands", () => {
  for (const s of ALL_STARTERS) {
    const cleaned = cleanBlocks(s.blocks);
    assert.equal(cleaned.length, s.blocks.length, `${s.key} lost blocks when cleaned`);
    assert.ok(cleaned.some((b) => b.type === "signature"), `${s.key} has no signature`);
  }
});

test("every trade is offered at least one starter, and a tattoo studio is offered a tattoo consent", () => {
  for (const pack of VERTICAL_LIST) {
    const { suggested, others } = startersFor(pack);
    assert.ok(suggested.length >= 1, pack.id);
    assert.equal(suggested.length + others.length, ALL_STARTERS.length, pack.id);
  }
  assert.equal(startersFor({ id: "tattoo", category: "Hair and beauty" }).suggested[0].key, "tattoo_consent");
  assert.ok(!startersFor({ id: "plumber", category: "Trades and home" }).suggested.some((s) => s.key === "tattoo_consent"));
});

// ───────────────────────────────────────────── a form needed before a service

const services = [
  { id: "colour", name: "Full head colour", requires_form_id: "patch" },
  { id: "cut", name: "Cut and finish", requires_form_id: null },
];
const templates = new Map([["patch", "Patch test and colour consent"]]);
const NOW = new Date("2026-09-16T12:00:00Z");

test("a service with no form needs nothing", () => {
  assert.equal(formNeeded({ serviceId: "cut", title: null, contactId: "jo" }, services, templates, [], NOW), null);
});

test("a colour with no form on file is missing, found by title when typed into the diary", () => {
  const need = formNeeded({ serviceId: null, title: "full head colour", contactId: "jo" }, services, templates, [], NOW);
  // reason rides along now, and is null where nobody wrote one.
  assert.deepEqual(need, { templateId: "patch", name: "Patch test and colour consent", state: "missing", reason: null });
});

test("one sent and not signed is waiting; one signed this year counts; last year's does not", () => {
  const appt = { serviceId: "colour", title: null, contactId: "jo" };
  assert.equal(
    formNeeded(appt, services, templates, [{ id: "f1", contact_id: "jo", template_id: "patch", status: "opened", signed_at: null, created_at: "2026-09-15T10:00:00Z" }], NOW)?.state,
    "waiting",
  );
  assert.equal(
    formNeeded(appt, services, templates, [{ id: "f2", contact_id: "jo", template_id: "patch", status: "signed", signed_at: "2026-03-01T10:00:00Z", created_at: "2026-03-01T09:00:00Z" }], NOW)?.state,
    "signed",
  );
  assert.equal(
    formNeeded(appt, services, templates, [{ id: "f3", contact_id: "jo", template_id: "patch", status: "signed", signed_at: "2025-08-01T10:00:00Z", created_at: "2025-08-01T09:00:00Z" }], NOW)?.state,
    "missing",
  );
});

test("somebody else's signed form does not count", () => {
  const need = formNeeded(
    { serviceId: "colour", title: null, contactId: "jo" },
    services,
    templates,
    [{ id: "f4", contact_id: "sam", template_id: "patch", status: "signed", signed_at: "2026-09-01T10:00:00Z", created_at: "2026-09-01T09:00:00Z" }],
    NOW,
  );
  assert.equal(need?.state, "missing");
});

// ───────────────────────────────────────────── quotes

test("a quote's lines are kept, cleaned and totalled; the customer cannot answer them", () => {
  const blocks = cleanBlocks([
    { id: "q", type: "lines", label: "Your quote", items: [
      { name: "End of tenancy clean, 2 bed", quantity: 1, pence: 18000 },
      { name: "Oven clean", quantity: 2, pence: 4500 },
      { name: "", quantity: 1, pence: 999 },
      { name: "Negative", quantity: 1, pence: -500 },
    ] },
    { id: "ok", type: "agree", label: "I accept this quote" },
    { id: "sign", type: "signature", label: "Signature" },
  ]);
  assert.equal(blocks[0].items?.length, 3);
  assert.equal(quoteTotal(blocks), 18000 + 9000 + 0);
  const a = readAnswers(blocks, (k) => (k === "q_q" ? "tampered" : k === "q_ok" ? "on" : null));
  assert.equal("q" in a, false);
  assert.deepEqual(whatIsMissing(blocks, a, { name: "Sue", signature: SIGNATURE }), []);
});

test("a quote with no priced lines is not a quote", () => {
  assert.equal(cleanBlocks([{ type: "lines", label: "Quote", items: [] }]).length, 0);
});

/*
 * One person asking for something the business does not.
 *
 * A salon where one stylist wants a patch test before every colour and the one
 * at the next chair has been doing it twenty years and asks at the
 * consultation. Before this the team had to agree on a single answer for
 * everybody, because the requirement lived on the service.
 */
const noFormServices = [
  { id: "colour", name: "Full head colour", requires_form_id: null },
  { id: "cut", name: "Cut and finish", requires_form_id: null },
];

test("a stylist can ask for a form the business does not", () => {
  const need = formNeeded(
    { serviceId: "colour", title: null, contactId: "jo", artistId: "stevie" },
    noFormServices,
    templates,
    [],
    NOW,
    [{ service_id: "colour", artist_id: "stevie", requires_form_id: "patch", form_reason: "I patch test everyone." }],
  );
  assert.equal(need?.templateId, "patch");
  assert.equal(need?.state, "missing");
  assert.equal(need?.reason, "I patch test everyone.");
});

test("and the stylist at the next chair is unaffected", () => {
  const need = formNeeded(
    { serviceId: "colour", title: null, contactId: "jo", artistId: "mark" },
    noFormServices,
    templates,
    [],
    NOW,
    [{ service_id: "colour", artist_id: "stevie", requires_form_id: "patch" }],
  );
  assert.equal(need, null);
});

test("their requirement is for that service, not for everything they do", () => {
  const need = formNeeded(
    { serviceId: "cut", title: null, contactId: "jo", artistId: "stevie" },
    noFormServices,
    templates,
    [],
    NOW,
    [{ service_id: "colour", artist_id: "stevie", requires_form_id: "patch" }],
  );
  assert.equal(need, null);
});

/*
 * The rule that matters. If the business requires a patch test, nobody on the
 * team can quietly replace it with something of their own — that is a safety
 * decision and it belongs to whoever runs the place.
 */
test("a person adds a requirement and can never remove or replace one", () => {
  const need = formNeeded(
    { serviceId: "colour", title: null, contactId: "jo", artistId: "stevie" },
    services,
    templates,
    [],
    NOW,
    [{ service_id: "colour", artist_id: "stevie", requires_form_id: "other" }],
  );
  assert.equal(need?.templateId, "patch", "the business's form must win");
});

test("nobody named means nothing personal applies", () => {
  const need = formNeeded(
    { serviceId: "colour", title: null, contactId: "jo" },
    noFormServices,
    templates,
    [],
    NOW,
    [{ service_id: "colour", artist_id: "stevie", requires_form_id: "patch" }],
  );
  assert.equal(need, null);
});
