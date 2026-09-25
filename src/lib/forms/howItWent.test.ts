import { test } from "node:test";
import assert from "node:assert/strict";
import { howItWent, wentNowhere, formLine } from "./howItWent.ts";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const base = {
  status: "sent",
  sentVia: "sms" as string | null,
  sentAt: "2026-10-03T09:00:00Z",
  openedAt: null as string | null,
  signedAt: null as string | null,
  createdAt: "2026-10-03T08:00:00Z",
  day,
};

test("a link is not a way of sending anything", () => {
  assert.equal(wentNowhere("link"), true);
  assert.equal(wentNowhere("sms"), false);
  assert.equal(wentNowhere("email"), false);
  assert.equal(wentNowhere(null), false, "an old row with no route is unknown, not unsent");
});

test("a form nobody has passed on does not claim to have been sent", () => {
  const line = formLine({ ...base, sentVia: "link" });
  assert.match(line, /Link made 2026-10-03/);
  assert.match(line, /not sent to anyone yet/);
  assert.doesNotMatch(line, /^Sent/, "nothing was sent, so the line must not say it was");
  assert.doesNotMatch(
    line,
    /not opened yet/,
    "not opened blames the customer for a link nobody gave them",
  );
});

test("a form that did go says how it went", () => {
  assert.match(formLine(base), /^Sent by text 2026-10-03 · not opened yet$/);
  assert.match(formLine({ ...base, sentVia: "email" }), /^Sent by email /);
  assert.match(formLine({ ...base, sentVia: "whatsapp" }), /^Sent on WhatsApp /);
  assert.match(formLine({ ...base, sentVia: "assistant" }), /^Sent in the conversation /);
});

test("an unknown route says nothing rather than guessing", () => {
  assert.equal(howItWent(null), "");
  assert.equal(howItWent("something-new"), "");
  const line = formLine({ ...base, sentVia: null });
  assert.match(line, /^Sent 2026-10-03 · not opened yet$/, "no double space, no invented channel");
});

test("opened beats whatever the row says about sending", () => {
  const line = formLine({
    ...base,
    status: "opened",
    sentVia: "link",
    openedAt: "2026-10-04T09:00:00Z",
  });
  assert.match(line, /^Opened 2026-10-04/);
  assert.doesNotMatch(
    line,
    /not sent to anyone/,
    "somebody used the link, so saying it was never sent is the same lie reversed",
  );
});

test("signed and paper are unchanged", () => {
  assert.equal(
    formLine({ ...base, status: "signed", signedAt: "2026-10-05T09:00:00Z" }),
    "Signed 2026-10-05",
  );
  assert.equal(
    formLine({ ...base, status: "paper", signedAt: null }),
    "Kept 2026-10-03",
  );
});
