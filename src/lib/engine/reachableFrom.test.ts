import { test } from "node:test";
import assert from "node:assert/strict";
import { reachableFrom } from "./reachableFrom.ts";

test("an email thread knows the address, because it is the address", () => {
  assert.deepEqual(reachableFrom("email", "hannah.p@gmail.com"), { email: "hannah.p@gmail.com" });
  // However the provider capitalised it.
  assert.deepEqual(reachableFrom("email", "Hannah.P@Gmail.com"), { email: "hannah.p@gmail.com" });
});

test("a text thread knows the number, exactly as it arrived", () => {
  assert.deepEqual(reachableFrom("sms", "+447700900123"), { phone: "+447700900123" });
  assert.deepEqual(reachableFrom("whatsapp", "+447700900123"), { phone: "+447700900123" });
  assert.deepEqual(reachableFrom("voice", "07700 900123"), { phone: "07700 900123" });
});

/*
 * The website's session key is invented by the browser and reaches nobody, and
 * an Instagram thread handle only works inside Instagram. Writing either into
 * a phone or email column would put a thing in the client list that looks like
 * a way to contact somebody and is not — which is worse than an empty row.
 */
test("the website and Instagram tell us nothing we can write to", () => {
  assert.deepEqual(reachableFrom("web", "sess_8fj20dk20fj"), {});
  assert.deepEqual(reachableFrom("instagram", "17841400000000000"), {});
});

test("anything that is not an address is left alone", () => {
  assert.deepEqual(reachableFrom("email", "not an address"), {});
  assert.deepEqual(reachableFrom("email", ""), {});
  assert.deepEqual(reachableFrom("sms", "unknown"), {});
  assert.deepEqual(reachableFrom("sms", "   "), {});
  assert.deepEqual(reachableFrom("email", "someone@localhost"), {}, "no dot, no domain");
});
