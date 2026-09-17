import { test } from "node:test";
import assert from "node:assert/strict";
import { sayDate, dueMessage, dueKey } from "./dueReminders.ts";
import type { TradeFact } from "./tradeFacts.ts";

const mot: TradeFact = {
  key: "mot_due",
  label: "MOT due",
  type: "date",
  remindBefore: 45,
  remindText: "your MOT runs out on {date}",
};

const service: TradeFact = {
  key: "service_due",
  label: "Service due",
  type: "date",
  remindBefore: 30,
};

test("a date is said the way a person says it", () => {
  assert.equal(sayDate("2026-11-01"), "1 November");
  assert.equal(sayDate("not a date"), "not a date");
});

test("the reminder names the business and offers the slot", () => {
  const text = dueMessage(mot, "2026-11-01", { name: "Dave Smith", business: "Cogs & Co" });
  assert.match(text, /^Hi Dave — your MOT runs out on 1 November\./);
  assert.match(text, /Cogs & Co here/);
  assert.match(text, /book you in before then/);
});

/*
 * Marketing under PECR however useful it is — an existing customer, a similar
 * service, and a way out in every single message. Without this line the text
 * is unlawful, so it is a test and not a comment.
 */
test("every reminder carries the way out", () => {
  assert.match(dueMessage(mot, "2026-11-01", { business: "Cogs & Co" }), /Reply STOP to opt out/);
  assert.match(dueMessage(service, "2026-11-01", { business: "Cogs & Co" }), /Reply STOP to opt out/);
});

test("no name, no awkward greeting", () => {
  const text = dueMessage(mot, "2026-11-01", { name: "  ", business: "Cogs & Co" });
  assert.match(text, /^your MOT runs out/);
});

test("a fact with no wording of its own still reads", () => {
  assert.match(
    dueMessage(service, "2026-10-04", { name: "Jo", business: "Cogs & Co" }),
    /your service due is due on 4 October/,
  );
});

/*
 * Next year's MOT is a different reminder about the same car and the same
 * field. A key without the date would swallow it and the customer would hear
 * from us once, ever.
 */
test("the date is part of the claim", () => {
  assert.notEqual(dueKey("c1", mot, "2026-11-01"), dueKey("c1", mot, "2027-11-01"));
  assert.equal(dueKey("c1", mot, "2026-11-01"), "due:c1:mot_due:2026-11-01");
});

/*
 * Two of these count backwards. A boiler serviced eleven months ago is due
 * another one, and a negative remindBefore is how that is said — so the
 * sentence must not tell somebody to book in before a date last November.
 */
test("a date already past does not say before then", () => {
  const serviced = {
    key: "serviced",
    label: "Last serviced",
    type: "date" as const,
    remindBefore: -335,
    remindText: "your boiler is about due its yearly service",
  };
  const now = new Date("2026-09-17T09:00:00Z");
  const text = dueMessage(serviced, "2025-10-17", { name: "Jo", business: "Ashcroft" }, now);
  assert.match(text, /want me to book you in\? Reply STOP/);
  assert.doesNotMatch(text, /before then/);

  const mot2 = { key: "mot_due", label: "MOT due", type: "date" as const, remindBefore: 45 };
  assert.match(
    dueMessage(mot2, "2026-11-01", { business: "Cogs" }, now),
    /book you in before then/,
  );
});
