import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedSignature, signaturePayload, verifySignature } from "./sms.ts";

/*
 * What gets hashed, rather than a signature copied from somewhere.
 *
 * The HMAC itself is the standard library and cannot be got wrong. What can be
 * got wrong is the string fed into it — the URL missing, the fields in the
 * wrong order, the name left off — and each of those would produce a
 * signature that never matches, or worse, one that matches too easily.
 *
 * So the canonical string is pinned here, and the rest of these check that
 * changing anything about the request changes the result.
 */
const AUTH = "12345";
const URL_WITH_QUERY = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS = {
  Digits: "1234",
  To: "+18005551212",
  From: "+14158675310",
  Caller: "+14158675310",
  CallSid: "CA1234567890ABCDE",
};

test("the signed string is the URL then every field, sorted by name", () => {
  assert.equal(
    signaturePayload(URL_WITH_QUERY, PARAMS),
    "https://mycompany.com/myapp.php?foo=1&bar=2" +
      "CallSidCA1234567890ABCDE" +
      "Caller+14158675310" +
      "Digits1234" +
      "From+14158675310" +
      "To+18005551212",
  );
});

test("the query string stays on the URL, because Twilio signs it too", () => {
  assert.match(signaturePayload(URL_WITH_QUERY, {}), /\?foo=1&bar=2$/);
});

const TWILIO_DOC = {
  authToken: AUTH,
  url: URL_WITH_QUERY,
  params: PARAMS,
  signature: expectedSignature(AUTH, URL_WITH_QUERY, PARAMS),
};

test("a genuine request is accepted", () => {
  assert.equal(
    verifySignature({
      authToken: TWILIO_DOC.authToken,
      url: TWILIO_DOC.url,
      params: TWILIO_DOC.params,
      signature: TWILIO_DOC.signature,
    }),
    true,
  );
});

// ------------------------------------------------- the ways it must not pass

test("no signature at all is refused", () => {
  assert.equal(verifySignature({ ...TWILIO_DOC, signature: null }), false);
});

test("a tampered message body is refused", () => {
  assert.equal(
    verifySignature({
      ...TWILIO_DOC,
      params: { ...TWILIO_DOC.params, Digits: "9999" },
    }),
    false,
  );
});

test("an added field is refused", () => {
  assert.equal(
    verifySignature({
      ...TWILIO_DOC,
      params: { ...TWILIO_DOC.params, Body: "book me in for tomorrow" },
    }),
    false,
  );
});

test("the same request replayed at a different URL is refused", () => {
  assert.equal(
    verifySignature({ ...TWILIO_DOC, url: "https://evil.example/myapp.php" }),
    false,
  );
});

test("the wrong auth token is refused", () => {
  assert.equal(verifySignature({ ...TWILIO_DOC, authToken: "54321" }), false);
});

test("a signature of the wrong length is refused rather than throwing", () => {
  assert.equal(verifySignature({ ...TWILIO_DOC, signature: "short" }), false);
});

test("field order does not change the signature", () => {
  const forwards = expectedSignature(TWILIO_DOC.authToken, TWILIO_DOC.url, {
    To: "+1", From: "+2", Body: "hello",
  });
  const backwards = expectedSignature(TWILIO_DOC.authToken, TWILIO_DOC.url, {
    Body: "hello", From: "+2", To: "+1",
  });
  assert.equal(forwards, backwards);
});
