import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readMetaEvents, verifyMetaSignature, verificationReply } from "./meta.ts";

// ------------------------------------------------------------------ WhatsApp

const whatsapp = (messages: unknown[], extra: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        { value: { metadata: { phone_number_id: "PHONE1" }, messages, ...extra } },
      ],
    },
  ],
});

test("a WhatsApp message becomes one event", () => {
  const got = readMetaEvents(
    whatsapp([{ id: "wamid.1", from: "447700900123", text: { body: "Do you do cover ups?" } }]),
  );
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], {
    channel: "whatsapp",
    accountId: "PHONE1",
    personId: "447700900123",
    text: "Do you do cover ups?",
    media: [],
    messageId: "wamid.1",
  });
});

test("a WhatsApp picture arrives as media, with no words", () => {
  const got = readMetaEvents(
    whatsapp([{ id: "wamid.2", from: "447700900123", image: { id: "IMG1" } }]),
  );
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].media, ["IMG1"]);
  assert.equal(got[0].text, "");
});

test("delivery receipts are not messages and are not answered", () => {
  const got = readMetaEvents(
    whatsapp([], { statuses: [{ id: "wamid.1", status: "delivered" }] }),
  );
  assert.deepEqual(got, []);
});

test("a sticker with no words and no media is not an enquiry", () => {
  const got = readMetaEvents(
    whatsapp([{ id: "wamid.3", from: "447700900123", type: "sticker", sticker: { id: "S" } }]),
  );
  assert.deepEqual(got, []);
});

// -------------------------------------------------- Messenger and Instagram

const messaging = (object: string, items: unknown[]) => ({
  object,
  entry: [{ id: "PAGE1", messaging: items }],
});

test("a Messenger message becomes one event", () => {
  const got = readMetaEvents(
    messaging("page", [
      {
        sender: { id: "PERSON1" },
        recipient: { id: "PAGE1" },
        message: { mid: "m.1", text: "what time do you open" },
      },
    ]),
  );
  assert.equal(got.length, 1);
  assert.equal(got[0].channel, "messenger");
  assert.equal(got[0].accountId, "PAGE1");
  assert.equal(got[0].personId, "PERSON1");
});

test("the same shape from Instagram is an Instagram event", () => {
  const got = readMetaEvents(
    messaging("instagram", [
      {
        sender: { id: "IGPERSON" },
        recipient: { id: "IGACCOUNT" },
        message: { mid: "m.2", text: "hiya" },
      },
    ]),
  );
  assert.equal(got[0].channel, "instagram");
  assert.equal(got[0].accountId, "IGACCOUNT");
});

test("an echo of our own message is never answered", () => {
  // The single most important line in the module: answering these means the
  // assistant talking to itself, forever, billed per message.
  const got = readMetaEvents(
    messaging("page", [
      {
        sender: { id: "PAGE1" },
        recipient: { id: "PERSON1" },
        message: { mid: "m.3", text: "We open at nine", is_echo: true },
      },
    ]),
  );
  assert.deepEqual(got, []);
});

test("read receipts and deliveries carry no message and are skipped", () => {
  const got = readMetaEvents(
    messaging("page", [
      { sender: { id: "PERSON1" }, recipient: { id: "PAGE1" }, read: { watermark: 1 } },
      { sender: { id: "PERSON1" }, recipient: { id: "PAGE1" }, delivery: { watermark: 1 } },
    ]),
  );
  assert.deepEqual(got, []);
});

test("a page messaging itself is not a customer", () => {
  const got = readMetaEvents(
    messaging("page", [
      { sender: { id: "PAGE1" }, recipient: { id: "PAGE1" }, message: { mid: "m", text: "test" } },
    ]),
  );
  assert.deepEqual(got, []);
});

test("an attachment comes through as media", () => {
  const got = readMetaEvents(
    messaging("page", [
      {
        sender: { id: "PERSON1" },
        recipient: { id: "PAGE1" },
        message: {
          mid: "m.4",
          attachments: [{ type: "image", payload: { url: "https://cdn/img.jpg" } }],
        },
      },
    ]),
  );
  assert.deepEqual(got[0].media, ["https://cdn/img.jpg"]);
});

test("several messages in one delivery all come back", () => {
  const got = readMetaEvents(
    messaging("page", [
      { sender: { id: "A" }, recipient: { id: "PAGE1" }, message: { mid: "1", text: "one" } },
      { sender: { id: "B" }, recipient: { id: "PAGE1" }, message: { mid: "2", text: "two" } },
    ]),
  );
  assert.equal(got.length, 2);
});

test("rubbish in gives nothing out, rather than throwing", () => {
  for (const bad of [null, undefined, {}, { entry: "no" }, { entry: [null] }, 42, "hello"]) {
    assert.deepEqual(readMetaEvents(bad), [], JSON.stringify(bad));
  }
});

// ----------------------------------------------------------------- security

const SECRET = "app-secret";
const sign = (body: string) =>
  "sha256=" + createHmac("sha256", SECRET).update(body, "utf8").digest("hex");

test("a delivery Meta signed is accepted", () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  assert.equal(
    verifyMetaSignature({ appSecret: SECRET, rawBody: body, header: sign(body) }),
    true,
  );
});

test("a body changed by one character is refused", () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  const header = sign(body);
  assert.equal(
    verifyMetaSignature({ appSecret: SECRET, rawBody: body + " ", header }),
    false,
  );
});

test("no signature, wrong algorithm and rubbish are all refused", () => {
  const body = "{}";
  assert.equal(verifyMetaSignature({ appSecret: SECRET, rawBody: body, header: null }), false);
  assert.equal(
    verifyMetaSignature({ appSecret: SECRET, rawBody: body, header: "sha1=" + sign(body).slice(7) }),
    false,
  );
  assert.equal(verifyMetaSignature({ appSecret: SECRET, rawBody: body, header: "sha256=" }), false);
  assert.equal(verifyMetaSignature({ appSecret: SECRET, rawBody: body, header: "nonsense" }), false);
});

test("with no app secret set, nothing is accepted at all", () => {
  const body = "{}";
  assert.equal(verifyMetaSignature({ appSecret: "", rawBody: body, header: sign(body) }), false);
});

// ------------------------------------------------------------- the handshake

test("the handshake returns the challenge only when the token matches", () => {
  const ok = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "ours",
    "hub.challenge": "12345",
  });
  assert.equal(verificationReply(ok, "ours"), "12345");
  assert.equal(verificationReply(ok, "theirs"), null);
  assert.equal(verificationReply(ok, ""), null);
});

test("a handshake that is not a subscribe is refused", () => {
  const wrong = new URLSearchParams({
    "hub.mode": "unsubscribe",
    "hub.verify_token": "ours",
    "hub.challenge": "12345",
  });
  assert.equal(verificationReply(wrong, "ours"), null);
});
