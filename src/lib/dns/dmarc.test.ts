import { test } from "node:test";
import assert from "node:assert/strict";
import { readDmarc, isAPersonsInbox } from "./dmarc.ts";

/*
 * The record that was actually published on second-pair.com while the health
 * check reported "DMARC is published ✓". A whole new record pasted into the
 * middle of the old one's rua field.
 */
const BROKEN =
  "v=DMARC1; p=none; rua=mailto:v=DMARC1; p=none; pct=100; " +
  "rua=mailto:re+d2qbkrbdswd@dmarc.postmarkapp.com; sp=none; " +
  "aspf=r;@inbox.dmarcdigests.com,mailto:info@second-pair.com";

test("the record that was live, and was reported as fine", () => {
  const read = readDmarc(BROKEN);
  assert.ok(read.faults.length >= 3, `only found: ${read.faults.join("; ")}`);

  // The reporting address became the start of the pasted record.
  assert.ok(
    read.faults.some((f) => f.includes("mailto:v=DMARC1")),
    `nothing said about the address: ${read.faults.join("; ")}`,
  );
  // Two records run into one shows up as repeated tags.
  assert.ok(read.faults.some((f) => f.includes("appears twice")));
  // And the tail left stranded with no tag name.
  assert.ok(read.faults.some((f) => f.includes("is not a tag")));
});

test("a record that is right has nothing wrong with it", () => {
  const read = readDmarc(
    "v=DMARC1; p=none; pct=100; rua=mailto:re+d2qbkrbdswd@dmarc.postmarkapp.com; sp=none; aspf=r",
  );
  assert.deepEqual(read.faults, []);
  assert.equal(read.tags.p, "none");
  assert.deepEqual(read.reportTo, ["re+d2qbkrbdswd@dmarc.postmarkapp.com"]);
});

test("two reporting addresses are both read", () => {
  const read = readDmarc(
    "v=DMARC1; p=none; rua=mailto:a@inbox.dmarcdigests.com,mailto:info@second-pair.com",
  );
  assert.deepEqual(read.faults, []);
  assert.deepEqual(read.reportTo, ["a@inbox.dmarcdigests.com", "info@second-pair.com"]);
});

test("the version has to come first, and has to be there", () => {
  assert.ok(readDmarc("p=none; v=DMARC1").faults.some((f) => f.includes("first thing")));
  assert.ok(readDmarc("p=none; rua=mailto:a@b.com").faults.some((f) => f.includes("v=DMARC1")));
});

test("a policy nobody recognises is a fault, not a guess", () => {
  assert.ok(readDmarc("v=DMARC1; p=off").faults.some((f) => f.includes("not a policy")));
  assert.deepEqual(readDmarc("v=DMARC1; p=reject").faults, []);
});

test("no rua is not broken, it is just silent", () => {
  const read = readDmarc("v=DMARC1; p=none");
  assert.deepEqual(read.faults, []);
  assert.ok(read.notes.some((n) => n.includes("no reports")));
});

/*
 * Whose inbox the daily XML lands in, which is the whole point of the job
 * Giles is doing: every receiver that honours DMARC sends one report a day per
 * domain to every address named here.
 */
test("a report processor is not somebody's inbox", () => {
  for (const good of [
    "re+d2qbkrbdswd@dmarc.postmarkapp.com",
    "a1b2@inbox.dmarcdigests.com",
    "x@dmarcian.com",
  ]) {
    assert.equal(isAPersonsInbox(good), false, good);
  }
  for (const bad of ["info@second-pair.com", "giles@gmail.com", "hello@someshop.co.uk"]) {
    assert.equal(isAPersonsInbox(bad), true, bad);
  }
});
