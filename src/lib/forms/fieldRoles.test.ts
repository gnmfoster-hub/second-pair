import { test } from "node:test";
import assert from "node:assert/strict";
import { prefillFor, whatToSave, roleOf } from "./fieldRoles.ts";

/**
 * A form that writes to the client record is a customer editing a business's
 * own data. Most of these are about what it must refuse to do.
 */

const her = {
  name: "Marie Whitlock",
  phone: "+447700900111",
  email: "marie@example.com",
  address: "2 Union Street",
  postcode: "TQ12 2JS",
  alert: "Gate code 4412",
  notes: "Prefers mornings",
  facts: { vaccination_due: "2027-03-01", breed: "Collie" },
};

/* ------------------------------------------------------------ filling it in */

test("a box with a role arrives filled in", () => {
  const filled = prefillFor(
    [
      { id: "a", role: "name" },
      { id: "b", role: "phone" },
      { id: "c", role: "fact:breed" },
    ],
    her,
  );
  assert.deepEqual(filled, { a: "Marie Whitlock", b: "+447700900111", c: "Collie" });
});

test("a box with no role is left alone, however it is labelled", () => {
  const filled = prefillFor([{ id: "a" }, { id: "b", role: "nonsense" }], her);
  assert.deepEqual(filled, {});
});

test("nothing we do not hold is invented", () => {
  const filled = prefillFor([{ id: "a", role: "postcode" }], { name: "New Person" });
  assert.deepEqual(filled, {});
});

/*
 * The alert and the notes are the business talking to itself. Showing a
 * customer "Gate code 4412" or "Prefers mornings" would be a leak, and asking
 * them to confirm it would be worse.
 */
test("the alert and the notes are never shown to the customer", () => {
  const filled = prefillFor(
    [
      { id: "a", role: "alert" },
      { id: "b", role: "note" },
    ],
    her,
  );
  assert.deepEqual(filled, {});
});

/* ------------------------------------------------------------- writing back */

test("answers go to the right place", () => {
  const save = whatToSave(
    [
      { id: "a", role: "name" },
      { id: "b", role: "email" },
      { id: "c", role: "fact:vaccination_due" },
    ],
    { a: "Marie Whitlock", b: "Marie@Example.COM", c: "2027-03-01" },
  );
  assert.equal(save.person.name, "Marie Whitlock");
  assert.equal(save.person.email, "marie@example.com", "an email is lowercased");
  assert.deepEqual(save.facts, { vaccination_due: "2027-03-01" });
});

/* The one that matters. */
test("a question they skipped never clears what is on file", () => {
  const save = whatToSave(
    [
      { id: "a", role: "phone" },
      { id: "b", role: "email" },
      { id: "c", role: "fact:breed" },
    ],
    { a: "", b: "   ", c: "" },
    her,
  );
  assert.deepEqual(save.person, {});
  assert.deepEqual(save.facts, {});
  assert.equal(save.alert, null);
});

test("a blank form changes nothing at all", () => {
  const save = whatToSave([{ id: "a", role: "name" }], {}, her);
  assert.deepEqual(save, { person: {}, facts: {}, alert: null, notes: null });
});

/* ------------------------------------------------------- the alert and notes */

test("an alert is added to rather than replacing what somebody typed", () => {
  const save = whatToSave(
    [{ id: "a", role: "alert", label: "Behaviour to know about" }],
    { a: "Reactive to other dogs" },
    her,
  );
  assert.equal(save.alert, "Gate code 4412\nBehaviour to know about: Reactive to other dogs");
});

test("the same answer twice does not stack up", () => {
  const once = whatToSave(
    [{ id: "a", role: "alert", label: "Behaviour" }],
    { a: "Reactive to other dogs" },
    { alert: "Behaviour: Reactive to other dogs" },
  );
  assert.equal(once.alert, null, "nothing to change, so nothing is written");
});

test("an alert on somebody with none is just the alert", () => {
  const save = whatToSave([{ id: "a", role: "alert", label: "Watch out for" }], { a: "Bites" }, {});
  assert.equal(save.alert, "Watch out for: Bites");
});

test("notes are appended the same way", () => {
  const save = whatToSave(
    [{ id: "a", role: "note", label: "Anything else" }],
    { a: "Back gate sticks" },
    her,
  );
  assert.equal(save.notes, "Prefers mornings\nAnything else: Back gate sticks");
});

/* ------------------------------------------------------------- what is a role */

test("only roles we understand are honoured", () => {
  assert.equal(roleOf({ role: "name" }), "name");
  assert.equal(roleOf({ role: "fact:vaccination_due" }), "fact:vaccination_due");
  assert.equal(roleOf({ role: "alert" }), "alert");
  assert.equal(roleOf({}), null);
  assert.equal(roleOf({ role: "" }), null);
  assert.equal(roleOf({ role: "fact:" }), null, "a fact needs a key");
  assert.equal(roleOf({ role: "fact:Drop Table" }), null, "and a sane one");
  assert.equal(roleOf({ role: "contacts.phone" }), null);
  assert.equal(roleOf({ role: 7 }), null);
});

/*
 * The whole point, said once: an answer can reach the thing that refuses a
 * booking. A vaccination expiry typed on a form is the same column the trade
 * pack blocks on, so a dog whose jabs have run out stops being bookable
 * without anybody rekeying anything.
 */
test("a vaccination expiry lands on the fact the trade pack blocks on", () => {
  const save = whatToSave(
    [{ id: "v", role: "fact:vaccination_due" }],
    { v: "2026-11-30" },
    her,
  );
  assert.equal(save.facts.vaccination_due, "2026-11-30");
});

test("several dogs' answers all land, because the keys differ", () => {
  const save = whatToSave(
    [
      { id: "d1", role: "fact:breed" },
      { id: "d2", role: "fact:breed_2" },
    ],
    { d1: "Collie", d2: "Spaniel" },
  );
  assert.deepEqual(save.facts, { breed: "Collie", breed_2: "Spaniel" });
});
