import { test } from "node:test";
import assert from "node:assert/strict";
import { boxStartsOn } from "./reach.ts";

const sms = { channel: "sms", open: true };
const email = { channel: "email", open: true };
const whatsapp = { channel: "whatsapp", open: true };

/*
 * Email costs nothing and a text costs every time, and a message somebody
 * types by hand is rarely the one that has to be read within the minute.
 */
test("with both open it starts on email", () => {
  assert.equal(boxStartsOn([sms, email]), "email");
  assert.equal(boxStartsOn([email, sms]), "email");
});

/*
 * A promise beats four pence. Somebody who asked to be texted gets texted.
 */
test("a stated preference wins over the cheap one", () => {
  assert.equal(boxStartsOn([sms, email], "sms"), "sms");
  assert.equal(boxStartsOn([sms, email], "email"), "email");
});

test("a preference we cannot honour is ignored rather than obeyed", () => {
  assert.equal(boxStartsOn([sms], "email"), "sms");
  assert.equal(boxStartsOn([whatsapp], "email"), "whatsapp");
});

test("without email it starts on whatever is open", () => {
  assert.equal(boxStartsOn([whatsapp, sms]), "whatsapp");
});

/*
 * It chooses which door to start at, never whether one exists.
 */
test("a shut channel is never chosen", () => {
  assert.equal(boxStartsOn([{ channel: "email", open: false }, sms]), "sms");
  assert.equal(boxStartsOn([{ channel: "email", open: false }]), null);
  assert.equal(boxStartsOn([]), null);
});
