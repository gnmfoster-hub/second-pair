import { test } from "node:test";
import assert from "node:assert/strict";
import {
  businessMay,
  personMay,
  mayMarket,
  channelsOn,
  reachable,
} from "./marketingPlan.ts";

const bought = { marketing_email_on: true, marketing_sms_on: true };
const boughtEmail = { marketing_email_on: true, marketing_sms_on: false };

const agreed = {
  email: "marie@example.com",
  phone: "+447700900123",
  marketing_email: true,
  marketing_sms: true,
};

test("a business that has not bought it cannot send", () => {
  assert.equal(businessMay({}, "email"), false);
  assert.equal(businessMay({}, "sms"), false);
});

/*
 * The column is absent until the migration runs, and a deploy can land first.
 * An entitlement that reads as on while the column is missing is a business
 * sending campaigns it has not paid for, to people who may not have agreed.
 */
test("an absent column reads as off, not on", () => {
  assert.equal(businessMay({ marketing_email_on: undefined }, "email"), false);
  assert.equal(businessMay({ marketing_email_on: null }, "email"), false);
});

test("the two channels are bought separately", () => {
  assert.equal(businessMay(boughtEmail, "email"), true);
  assert.equal(businessMay(boughtEmail, "sms"), false);
  assert.deepEqual(channelsOn(boughtEmail), ["email"]);
});

test("a stopped business markets to nobody, whatever it bought", () => {
  assert.equal(businessMay({ ...bought, archived_at: "2026-09-01" }, "email"), false);
  assert.deepEqual(channelsOn({ ...bought, archived_at: "2026-09-01" }), []);
});

test("somebody who has not agreed is not marketed to", () => {
  assert.equal(personMay({ email: "a@b.com", marketing_email: false }, "email"), false);
  assert.equal(personMay({ email: "a@b.com" }, "email"), false);
});

/*
 * Agreeing is not the same as being reachable. Somebody can tick the box on a
 * form that never asked for an email address, and a campaign that counts them
 * as an audience is a campaign whose numbers are wrong.
 */
test("agreeing without an address is not reachable", () => {
  assert.equal(personMay({ marketing_email: true, email: null }, "email"), false);
  assert.equal(personMay({ marketing_sms: true, phone: null }, "sms"), false);
});

/*
 * The one that matters most. Both halves, every time: the business bought it
 * and the person agreed. Either alone must not be enough.
 */
test("both halves are needed before anything is sent", () => {
  assert.equal(mayMarket(bought, agreed, "email"), true);
  assert.equal(mayMarket({}, agreed, "email"), false, "not bought");
  assert.equal(mayMarket(bought, { email: "a@b.com" }, "email"), false, "not agreed");
});

test("buying texts does not let you email, and the reverse", () => {
  const smsOnly = { marketing_email_on: false, marketing_sms_on: true };
  assert.equal(mayMarket(smsOnly, agreed, "email"), false);
  assert.equal(mayMarket(smsOnly, agreed, "sms"), true);
});

test("the audience is counted after both tests, not before", () => {
  const people = [
    agreed,
    { email: "b@c.com", marketing_email: true },
    { email: "c@d.com", marketing_email: false },
    { marketing_email: true },
  ];
  assert.equal(reachable(bought, people, "email"), 2);
  /* Not bought: nobody, however many agreed. */
  assert.equal(reachable({}, people, "email"), 0);
});
