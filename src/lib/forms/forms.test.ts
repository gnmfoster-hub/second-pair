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
  type Block,
} from "./blocks.ts";
import { ALL_STARTERS, startersFor } from "./starters.ts";
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
    "Sign in the box.",
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
