import { test } from "node:test";
import assert from "node:assert/strict";
import { routesFor, channelLabel } from "./reach.ts";

const NOW = Date.parse("2026-09-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const conv = (over: Partial<Parameters<typeof routesFor>[0]["conversations"][0]> = {}) => ({
  id: "c1",
  channel: "whatsapp" as const,
  external_ref: "447700900000",
  last_inbound_at: hoursAgo(2),
  ...over,
});

// ------------------------------------------------------- the 24-hour window

test("a customer who wrote two hours ago can be messaged", () => {
  const [route] = routesFor({
    conversations: [conv()],
    phone: null,
    connected: ["whatsapp"],
    now: NOW,
  });
  assert.equal(route.open, true);
  assert.equal(route.blocked, undefined);
});

test("a customer who wrote twenty-five hours ago cannot", () => {
  const [route] = routesFor({
    conversations: [conv({ last_inbound_at: hoursAgo(25) })],
    phone: null,
    connected: ["whatsapp"],
    now: NOW,
  });
  assert.equal(route.open, false);
  assert.match(route.blocked ?? "", /24 hours/);
});

test("the reason says how long ago they wrote, in days once it is days", () => {
  const [route] = routesFor({
    conversations: [conv({ last_inbound_at: hoursAgo(72) })],
    phone: null,
    connected: ["whatsapp"],
    now: NOW,
  });
  assert.match(route.blocked ?? "", /3 days ago/);
});

test("a customer who has never written cannot be messaged on WhatsApp", () => {
  const [route] = routesFor({
    conversations: [conv({ last_inbound_at: null })],
    phone: null,
    connected: ["whatsapp"],
    now: NOW,
  });
  assert.equal(route.open, false);
});

test("the website chat has no window — they read it when they come back", () => {
  const [route] = routesFor({
    conversations: [conv({ channel: "web", last_inbound_at: hoursAgo(500) })],
    phone: null,
    connected: [],
    now: NOW,
  });
  assert.equal(route.open, true);
});

// ----------------------------------------------------- what is even plugged in

test("an unconnected channel says so, rather than blaming the window", () => {
  const [route] = routesFor({
    conversations: [conv({ channel: "instagram", last_inbound_at: hoursAgo(1) })],
    phone: null,
    connected: [],
    now: NOW,
  });
  assert.equal(route.open, false);
  assert.match(route.blocked ?? "", /not connected/);
});

// --------------------------------------------------------------- cold starts

test("a known number offers a text message even with no conversation", () => {
  const routes = routesFor({
    conversations: [],
    phone: "447700900123",
    connected: ["sms"],
    now: NOW,
  });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].channel, "sms");
  assert.equal(routes[0].conversationId, null, "a cold message starts a new thread");
  assert.equal(routes[0].open, true);
});

test("without SMS set up, the cold route explains that it is the only way", () => {
  const [route] = routesFor({
    conversations: [],
    phone: "447700900123",
    connected: ["whatsapp"],
    now: NOW,
  });
  assert.equal(route.open, false);
  assert.match(route.blocked ?? "", /not set up|only way/);
});

test("no number, no cold route — there is nothing to send to", () => {
  const routes = routesFor({ conversations: [], phone: null, connected: ["sms"], now: NOW });
  assert.equal(routes.length, 0);
});

test("an existing text thread is not duplicated by the cold route", () => {
  const routes = routesFor({
    conversations: [conv({ channel: "sms", external_ref: "447700900123" })],
    phone: "447700900123",
    connected: ["sms"],
    now: NOW,
  });
  assert.equal(routes.filter((r) => r.channel === "sms").length, 1);
  assert.equal(routes[0].conversationId, "c1", "it continues the thread it already has");
});

// ------------------------------------------------------------------ ordering

test("what they can actually use comes first", () => {
  const routes = routesFor({
    conversations: [
      conv({ id: "shut", channel: "instagram", last_inbound_at: hoursAgo(48) }),
      conv({ id: "open", channel: "whatsapp", last_inbound_at: hoursAgo(1) }),
    ],
    phone: null,
    connected: ["instagram", "whatsapp"],
    now: NOW,
  });
  assert.equal(routes[0].conversationId, "open");
  assert.equal(routes[1].conversationId, "shut");
});

test("a conversation with nothing to address is skipped", () => {
  const routes = routesFor({
    conversations: [conv({ external_ref: null })],
    phone: null,
    connected: ["whatsapp"],
    now: NOW,
  });
  assert.equal(routes.length, 0);
});

test("channels are named the way the owner would name them", () => {
  assert.equal(channelLabel("whatsapp"), "WhatsApp");
  assert.equal(channelLabel("sms"), "Text message");
});

// ----------------------------------------------------------------- by email

test("a known email offers a cold route once email is set up", () => {
  const routes = routesFor({
    conversations: [],
    phone: null,
    email: "priya@example.com",
    connected: ["email"],
    now: NOW,
  });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].channel, "email");
  assert.equal(routes[0].open, true);
  assert.equal(routes[0].conversationId, null);
});

test("without email set up, the route says so rather than vanishing", () => {
  const [route] = routesFor({
    conversations: [],
    phone: null,
    email: "priya@example.com",
    connected: [],
    now: NOW,
  });
  assert.equal(route.open, false);
  assert.match(route.blocked ?? "", /not set up/);
});

test("a text is offered before an email, because a text gets read", () => {
  const routes = routesFor({
    conversations: [],
    phone: "447700900123",
    email: "priya@example.com",
    connected: ["sms", "email"],
    now: NOW,
  });
  assert.deepEqual(
    routes.map((r) => r.channel),
    ["sms", "email"],
  );
});

test("a live conversation still beats both cold routes", () => {
  const routes = routesFor({
    conversations: [conv({ last_inbound_at: hoursAgo(1) })],
    phone: "447700900123",
    email: "priya@example.com",
    connected: ["whatsapp", "sms", "email"],
    now: NOW,
  });
  assert.equal(routes[0].channel, "whatsapp");
  assert.equal(routes[0].conversationId, "c1", "it carries on where they left off");
});

test("an existing email thread is not duplicated by the cold route", () => {
  const routes = routesFor({
    conversations: [
      conv({ channel: "email", external_ref: "priya@example.com", last_inbound_at: hoursAgo(5) }),
    ],
    phone: null,
    email: "priya@example.com",
    connected: ["email"],
    now: NOW,
  });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].conversationId, "c1");
});

test("email has no twenty-four hour window — it is not Meta's to close", () => {
  const [route] = routesFor({
    conversations: [
      conv({ channel: "email", external_ref: "p@example.com", last_inbound_at: hoursAgo(400) }),
    ],
    phone: null,
    connected: ["email"],
    now: NOW,
  });
  assert.equal(route.open, true);
});
