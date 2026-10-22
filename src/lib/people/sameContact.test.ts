import { test } from "node:test";
import assert from "node:assert/strict";
import { matchContact, sameEmail, fillGaps, phoneTail } from "./sameContact.ts";

const jessOnTheWebsite = {
  id: "web",
  name: "Jess",
  email: "jessierosemiller@icloud.com",
  phone: null,
  created_at: "2026-10-18T10:38:00Z",
};

/*
 * The one that actually happened, three times over. Jess at Living Canvas,
 * Samantha at Neat & Tidy and Julie at Amber's all chatted on the website and
 * then replied to the email, and all three became two people.
 */
test("somebody replying to their own confirmation is the same person", () => {
  const found = matchContact([jessOnTheWebsite], { email: "jessierosemiller@icloud.com" });
  assert.equal(found?.id, "web");
});

test("the case they type it in does not make them somebody else", () => {
  const found = matchContact([jessOnTheWebsite], { email: "JessieRoseMiller@iCloud.com " });
  assert.equal(found?.id, "web");
});

test("a different address is a different person", () => {
  assert.equal(matchContact([jessOnTheWebsite], { email: "jess@gmail.com" }), null);
});

test("nothing to go on matches nobody", () => {
  assert.equal(matchContact([jessOnTheWebsite], {}), null);
  assert.equal(matchContact([jessOnTheWebsite], { email: "not an address" }), null);
});

/*
 * Five spellings of one number, which is how many a real client list holds.
 * The database is asked a wide question and the answer is decided here.
 */
test("a number written any of the usual ways is the same number", () => {
  const onFile = [{ id: "a", phone: "07780 575834", created_at: "2026-01-01T00:00:00Z" }];
  for (const typed of ["+447780575834", "07780575834", "447780575834", "07780 575834"]) {
    assert.equal(matchContact(onFile, { phone: typed })?.id, "a", typed);
  }
});

test("a number that only ends the same is not a match", () => {
  const onFile = [{ id: "a", phone: "07780 575834", created_at: "2026-01-01T00:00:00Z" }];
  assert.equal(matchContact(onFile, { phone: "07999 575834" }), null);
});

/*
 * The guard that matters most. A rehearsal and a real customer must never
 * become one record, or a demo would write itself into somebody's client list.
 */
test("a test arrival never joins a real person", () => {
  const real = [{ id: "real", email: "a@b.com", is_test: false, created_at: "2026-01-01T00:00:00Z" }];
  assert.equal(matchContact(real, { email: "a@b.com" }, true), null);
  assert.equal(matchContact(real, { email: "a@b.com" }, false)?.id, "real");
});

test("the oldest record wins, because that is the one with the notes on it", () => {
  const rows = [
    { id: "new", email: "a@b.com", created_at: "2026-10-18T10:42:00Z" },
    { id: "old", email: "a@b.com", created_at: "2026-03-02T09:00:00Z" },
  ];
  assert.equal(matchContact(rows, { email: "a@b.com" })?.id, "old");
});

test("among records made at the same moment, the fuller one", () => {
  const rows = [
    { id: "bare", email: "a@b.com", created_at: "2026-03-02T09:00:00Z" },
    { id: "full", name: "Ada", email: "a@b.com", phone: "07780575834", created_at: "2026-03-02T09:00:00Z" },
  ];
  assert.equal(matchContact(rows, { email: "a@b.com" })?.id, "full");
});

/*
 * A name on the record is one somebody chose. A name on a From line is
 * whatever their mail client happened to put there, and Julie Koch lost her
 * surname that way.
 */
test("only the gaps are filled, never what is already there", () => {
  assert.deepEqual(fillGaps({ id: "a", name: "Julie Koch", email: null }, { email: "123jewelz@gmail.com" }), {
    email: "123jewelz@gmail.com",
  });
  assert.deepEqual(fillGaps({ id: "a", name: "Julie Koch", email: "julie@work.com" }, { email: "123jewelz@gmail.com" }), {});
});

test("the tail of a number, for asking the database", () => {
  assert.equal(phoneTail("+44 7780 575834"), "575834");
  assert.equal(phoneTail("07780575834"), "575834");
  assert.equal(phoneTail("123"), "");
  assert.equal(phoneTail(null), "");
});

test("an address is only an address if it has an at in it", () => {
  assert.equal(sameEmail("  A@B.COM "), "a@b.com");
  assert.equal(sameEmail("nothing"), "");
  assert.equal(sameEmail(null), "");
});
