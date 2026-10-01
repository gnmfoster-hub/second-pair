import { test } from "node:test";
import assert from "node:assert/strict";
import { howTheyWent } from "./howTheyWent.ts";

const sent = (at = "2026-09-20T09:00:00Z") => ({ sent_at: at, status: "sent" });
const due = () => ({ sent_at: null, status: "pending" });
const failed = () => ({ sent_at: null, status: "failed" });
const skipped = () => ({ sent_at: null, status: "skipped" });

test("one message is one message, not one messages", () => {
  assert.equal(howTheyWent([sent()]).label, "1 message · 1 sent");
});

test("the parts add up to the count beside them", () => {
  for (const list of [
    [sent(), due()],
    [sent(), sent(), failed(), skipped(), due()],
    [failed(), failed()],
    [skipped()],
  ]) {
    const { label } = howTheyWent(list);
    const counted = [...label.matchAll(/(\d+) (?:sent|failed|not sent|still to go)/g)].reduce(
      (a, m) => a + Number(m[1]),
      0,
    );
    assert.equal(counted, list.length, label);
  }
});

test("nothing that did not happen is mentioned", () => {
  const { label } = howTheyWent([sent(), sent()]);
  assert.equal(label, "2 messages · 2 sent");
  assert.ok(!label.includes("failed"));
  assert.ok(!label.includes("still to go"));
});

test("a failure is worth saying in red", () => {
  assert.equal(howTheyWent([sent(), failed()]).bad, true);
  assert.equal(howTheyWent([sent(), skipped(), due()]).bad, false);
});

/*
 * The September fault, as a test. An ordinary skip showed as a red "Reminder
 * failed" on every client's timeline because the two were read as one thing.
 */
test("a skip is not a failure", () => {
  const { label, bad } = howTheyWent([skipped()]);
  assert.equal(label, "1 message · 1 not sent");
  assert.equal(bad, false);
});

test("something sent despite an error against it counts as sent", () => {
  /* The sender records a text failure on a reminder that got through by email. */
  const both = { sent_at: "2026-09-20T09:00:00Z", status: "sent" };
  assert.equal(howTheyWent([both]).label, "1 message · 1 sent");
  assert.equal(howTheyWent([both]).bad, false);
});

test("a status nobody has heard of is still counted, as still to go", () => {
  const odd = { sent_at: null, status: "halfway" };
  assert.equal(howTheyWent([odd]).label, "1 message · 1 still to go");
});

test("no messages gives a line with no counts rather than a dangling dot", () => {
  assert.equal(howTheyWent([]).label, "0 messages");
});

test("nothing in it reads as AI, which here means no long dashes", () => {
  for (const list of [[sent(), failed()], [skipped(), due()], [sent()]]) {
    assert.ok(!howTheyWent(list).label.includes("—"));
  }
});
