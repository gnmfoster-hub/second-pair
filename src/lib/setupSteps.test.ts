import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerSteps, staffSteps, progressOf } from "./setupSteps.ts";
import type { Capability } from "./readiness.ts";

const cap = (key: string, ready: boolean, extra: Partial<Capability> = {}): Capability => ({
  key,
  can: key,
  ready,
  otherwise: `${key} missing`,
  href: `/fix/${key}`,
  action: `Fix ${key}`,
  blocking: false,
  ...extra,
});

const allReady = ["hours", "quote", "priced", "stripe", "policy", "faqs", "phone", "widget", "privacy"].map((k) => cap(k, true));

const facts = (over: Partial<Parameters<typeof ownerSteps>[0]> = {}) => ({
  capabilities: allReady,
  slug: "willow",
  team: 3,
  canSignIn: 2,
  conversations: 4,
  fromWebsite: 1,
  words: { practitioners: "stylists", customers: "clients" },
  money: { decided: true },
  ...over,
});

test("a finished business has every step ticked", () => {
  const steps = ownerSteps(facts());
  assert.ok(steps.every((s) => s.done));
  assert.deepEqual(progressOf(steps), { done: 8, of: 8, next: null });
});

test("a brand new business starts at its hours", () => {
  const steps = ownerSteps(
    facts({
      capabilities: allReady.map((c) => ({ ...c, ready: false })),
      team: 0,
      conversations: 0,
      fromWebsite: 0,
    }),
  );
  const p = progressOf(steps);
  assert.equal(p.done, 0);
  assert.equal(p.next?.key, "hours");
  assert.equal(steps[0].todo, "hours missing");
});

test("the order goes hours, prices, team, paid, questions, try, phone, website, privacy", () => {
  assert.deepEqual(
    ownerSteps(facts()).map((s) => s.key),
    ["hours", "prices", "team", "paid", "faqs", "try", "told", "website", "privacy"],
  );
});

test("prices are not done while nobody takes bookings, even with a list", () => {
  const steps = ownerSteps(facts({ team: 0 }));
  assert.equal(steps.find((s) => s.key === "prices")?.done, false);
  assert.equal(steps.find((s) => s.key === "team")?.action, "Add yourself");
});

test("getting paid points at Stripe first, then the policy", () => {
  const noStripe = ownerSteps(
    facts({ capabilities: allReady.map((c) => (c.key === "stripe" ? cap("stripe", false, { href: "/settings/you", action: "Connect" }) : c)) }),
  ).find((s) => s.key === "paid");
  assert.equal(noStripe?.href, "/settings/you");
  assert.equal(noStripe?.action, "Connect");

  const noPolicy = ownerSteps(
    facts({ capabilities: allReady.map((c) => (c.key === "policy" ? cap("policy", false) : c)) }),
  ).find((s) => s.key === "paid");
  assert.equal(noPolicy?.done, false);
  assert.equal(noPolicy?.action, "Write the policy");
});

test("the website step waits for a real visit through the button", () => {
  const steps = ownerSteps(facts({ fromWebsite: 0 }));
  const w = steps.find((s) => s.key === "website");
  assert.equal(w?.done, false);
  assert.match(w?.todo ?? "", /ticks itself/);
});

test("privacy is optional and does not hold up the count", () => {
  const steps = ownerSteps(facts({ capabilities: allReady.map((c) => (c.key === "privacy" ? cap("privacy", false) : c)) }));
  const p = progressOf(steps);
  assert.equal(p.done, p.of);
  assert.equal(p.next?.key, "privacy");
});

test("a missing capability row reads as ready rather than crashing", () => {
  const steps = ownerSteps(facts({ capabilities: [] }));
  assert.ok(steps.find((s) => s.key === "hours")?.done);
});

const staff = (over = {}) => ({
  firstName: "Aisha",
  ownAccount: true,
  stripeConnected: false,
  canConnect: true,
  phoneSignedUp: false,
  managed: false,
  personalCalendar: false,
  slug: "willow",
  handle: "aisha",
  ...over,
});

test("somebody on the team sees phone, their own Stripe and their calendar", () => {
  const steps = staffSteps(staff());
  assert.deepEqual(steps.map((s) => s.key), ["told", "stripe", "calendar"]);
  assert.deepEqual(progressOf(steps).next?.key, "told");
});

test("no Stripe step where the business takes the money", () => {
  assert.ok(!staffSteps(staff({ ownAccount: false })).some((s) => s.key === "stripe"));
  assert.ok(!staffSteps(staff({ canConnect: false })).some((s) => s.key === "stripe"));
});

test("the calendar is optional for staff", () => {
  const p = progressOf(staffSteps(staff({ phoneSignedUp: true, stripeConnected: true })));
  assert.equal(p.done, p.of);
  assert.equal(p.next?.key, "calendar");
});

test("a business that has not looked at money yet is not ticked off", () => {
  const steps = ownerSteps(facts({ money: { decided: false } }));
  const paid = steps.find((s) => s.key === "paid");
  assert.equal(paid?.done, false);
  assert.equal(paid?.action, "Decide how you take money");
  assert.match(paid?.todo ?? "", /take cash or a card machine/);
});

test("a business that has decided is ticked when nothing is missing", () => {
  const paid = ownerSteps(facts()).find((s) => s.key === "paid");
  assert.equal(paid?.done, true);
});
