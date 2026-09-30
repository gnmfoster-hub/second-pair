import { test } from "node:test";
import assert from "node:assert/strict";
import { waysToReply, worthChoosing } from "./waysToReply.ts";

const both = {
  phone: "07700900123",
  email: "marie@example.com",
  smsReady: true,
  emailReady: true,
};

const ids = (ways: { id: string }[]) => ways.map((w) => w.id);

/*
 * ── The default must not change what today does ──────────────────────────────
 *
 * The first way returned is what gets used unless somebody picks another, and a
 * website enquiry already went text-then-email. If adding the choice also
 * changed the default, every business would quietly start answering customers
 * differently and nobody asked for that.
 */
test("a website enquiry still defaults to a text, as it did before", () => {
  const ways = waysToReply({ channel: "web", externalRef: "sess_1", ...both });
  assert.equal(ways[0].id, "sms");
  assert.deepEqual(ids(ways), ["sms", "email", "chat"]);
});

test("with no number, a website enquiry defaults to email", () => {
  const ways = waysToReply({ channel: "web", externalRef: "sess_1", ...both, phone: null });
  assert.equal(ways[0].id, "email");
  assert.deepEqual(ids(ways), ["email", "chat"]);
});

/*
 * The chat is always offered and always last.
 *
 * Last because it is the one place they are least likely to be looking - they
 * asked on a Tuesday evening and closed the tab. Offered because somebody typing
 * in the widget right now is a real case, and answering them there is instant.
 */
test("the chat is offered even when nothing was collected, and says what it means", () => {
  const ways = waysToReply({
    channel: "web",
    externalRef: "sess_1",
    phone: null,
    email: null,
    smsReady: true,
    emailReady: true,
  });
  assert.deepEqual(ids(ways), ["chat"]);
  assert.match(ways[0].note ?? "", /still have the page open|Nothing is sent/);
});

/*
 * A detail is no use if the business cannot send on it.
 *
 * Offering "Text" to a business with no number would be a button that fails, and
 * the failure would arrive after the owner had typed a reply and pressed send.
 */
test("a way is only offered if the business can actually send on it", () => {
  assert.deepEqual(
    ids(waysToReply({ channel: "web", externalRef: "s", ...both, smsReady: false })),
    ["email", "chat"],
  );
  assert.deepEqual(
    ids(waysToReply({ channel: "web", externalRef: "s", ...both, emailReady: false })),
    ["sms", "chat"],
  );
});

// ------------------------------------------------------------ other channels

test("a text conversation answers by text, with email beside it", () => {
  const ways = waysToReply({ channel: "sms", externalRef: "+447700900123", ...both });
  assert.deepEqual(ids(ways), ["sms", "email"]);
  /* The number the thread is on, not the one on the client record. */
  assert.equal(ways[0].to, "+447700900123");
});

test("an email conversation answers by email, with a text beside it", () => {
  const ways = waysToReply({ channel: "email", externalRef: "marie@work.com", ...both });
  assert.deepEqual(ids(ways), ["email", "sms"]);
  assert.equal(ways[0].to, "marie@work.com");
});

/*
 * ── Why the Meta channels get this most of all ───────────────────────────────
 *
 * Facebook refuses a free-form message more than twenty-four hours after the
 * customer's last one. So the channel somebody arrived on is sometimes the one
 * channel that cannot be used, and a number the assistant took while it was
 * talking to them is the difference between answering and not.
 */
test("a Meta thread offers the thread first and says when it will be refused", () => {
  for (const channel of ["instagram", "whatsapp", "messenger"]) {
    const ways = waysToReply({ channel, externalRef: "psid_1", ...both });
    assert.deepEqual(ids(ways), ["chat", "sms", "email"], channel);
    assert.match(ways[0].note ?? "", /day after their last message/i, channel);
  }
});

test("each Meta channel is called what a person calls it", () => {
  const named = (channel: string) =>
    waysToReply({ channel, externalRef: "x", ...both })[0].label;
  assert.equal(named("whatsapp"), "WhatsApp");
  assert.equal(named("messenger"), "Messenger");
  assert.equal(named("instagram"), "Instagram");
});

/*
 * A channel nobody has written a rule for yet.
 *
 * It must never come back empty: an empty list would hide the reply box on a
 * conversation an owner can plainly see and plainly answer.
 */
test("an unknown channel still offers whatever can be reached", () => {
  assert.deepEqual(ids(waysToReply({ channel: "carrier-pigeon", externalRef: null, ...both })), [
    "sms",
    "email",
  ]);
  const nothing = waysToReply({
    channel: "carrier-pigeon",
    externalRef: null,
    phone: null,
    email: null,
    smsReady: true,
    emailReady: true,
  });
  assert.equal(nothing.length, 1, "never empty");
  assert.equal(nothing[0].id, "chat");
});

test("every way says where it would go, or says it cannot", () => {
  for (const channel of ["web", "sms", "email", "instagram"]) {
    for (const way of waysToReply({ channel, externalRef: "x", ...both })) {
      assert.ok(way.label.length > 2, `${channel}/${way.id} needs a label`);
      assert.ok("to" in way, `${channel}/${way.id} must say where it goes`);
    }
  }
});

/* One way is not a choice, and a row of one button that cannot change is furniture. */
test("the choice is only worth showing when there is more than one", () => {
  assert.equal(worthChoosing(waysToReply({ channel: "web", externalRef: "s", ...both })), true);
  assert.equal(
    worthChoosing(
      waysToReply({
        channel: "sms",
        externalRef: "+44",
        ...both,
        email: null,
      }),
    ),
    false,
  );
});
