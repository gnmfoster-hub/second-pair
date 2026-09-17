import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readCsv,
  guessColumn,
  guessColumns,
  readTick,
  readRow,
  whyNot,
  keyOf,
} from "./importList.ts";

/* The headers Fresha actually exports, in their order. */
const FRESHA = [
  "ID", "First Name", "Last Name", "Full Name", "Blocked", "Block reason", "Gender",
  "Mobile Number", "Telephone", "Email", "Accepts Marketing", "Accepts SMS",
  "Marketing Address", "Address", "Post Code", "DOB", "Added", "Staff Alert",
  "Referral source", "Tags",
];

test("a spreadsheet's own quoting is read the way it wrote it", () => {
  const { headers, rows } = readCsv(
    '﻿Name,Notes,Phone\r\n' +
      '"Smith, Dave","He said ""no colour"", ever"\r\n' +
      "Jo,,07700 900111\r\n",
  );
  assert.deepEqual(headers, ["Name", "Notes", "Phone"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], "Smith, Dave", "a comma inside quotes is not a new column");
  assert.equal(rows[0][1], 'He said "no colour", ever', "doubled quotes are one quote");
  assert.equal(rows[1][2], "07700 900111");
});

test("blank lines are not customers", () => {
  const { rows } = readCsv("Name\nJo\n\n\nDave\n");
  assert.deepEqual(rows, [["Jo"], ["Dave"]]);
});

test("a newline inside a quoted note does not split the row", () => {
  const { rows } = readCsv('Name,Notes\nJo,"line one\nline two"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], "line one\nline two");
});

test("Fresha's own headings are guessed without being told", () => {
  const guessed = guessColumns(FRESHA);
  const of = (header: string) => guessed[FRESHA.indexOf(header)];

  assert.equal(of("Full Name"), "name");
  assert.equal(of("Mobile Number"), "phone");
  assert.equal(of("Email"), "email");
  assert.equal(of("Accepts Marketing"), "marketing_email");
  assert.equal(of("Accepts SMS"), "marketing_sms");
  assert.equal(of("Blocked"), "blocked");
  assert.equal(of("Block reason"), "alert");
  assert.equal(of("Staff Alert"), "alert");
  assert.equal(of("ID"), "ignore");

  // Nothing typed to put these in, and they are not thrown away.
  for (const h of ["DOB", "Address", "Post Code", "Gender", "Tags", "Referral source"]) {
    assert.equal(of(h), "keep", `${h} should be kept`);
  }
});

/*
 * Fresha exports a first name, a last name, and a full name made out of both.
 * Importing all three writes the name twice and overwrites it with itself.
 */
test("one name column wins where there are three", () => {
  const guessed = guessColumns(FRESHA);
  assert.equal(guessed[FRESHA.indexOf("Full Name")], "name");
  assert.equal(guessed[FRESHA.indexOf("First Name")], "ignore");
  assert.equal(guessed[FRESHA.indexOf("Last Name")], "ignore");

  // But where there is no full name, the two halves are used.
  const split = guessColumns(["First Name", "Last Name", "Email"]);
  assert.deepEqual(split, ["first_name", "last_name", "email"]);
});

test("a heading nobody has seen before is left alone", () => {
  assert.equal(guessColumn("Loyalty points balance"), "ignore");
  assert.equal(guessColumn(""), "ignore");
});

/*
 * An unreadable tick is not a no. Turning "maybe" into "no" loses somebody
 * their list; turning it into "yes" is unlawful. Unknown is the only honest
 * third answer and the schema has one.
 */
test("a tick is yes, no, or nothing said", () => {
  assert.equal(readTick("Yes"), true);
  assert.equal(readTick("TRUE"), true);
  assert.equal(readTick("1"), true);
  assert.equal(readTick("subscribed"), true);
  assert.equal(readTick("No"), false);
  assert.equal(readTick("0"), false);
  assert.equal(readTick(""), null);
  assert.equal(readTick("¯\\_(ツ)_/¯"), null);
  assert.equal(readTick(undefined), null);
});

test("a row becomes a customer, through the owner's own mapping", () => {
  const headers = ["Full Name", "Mobile Number", "Email", "Accepts SMS", "DOB", "Tags"];
  const mapping = guessColumns(headers);
  const contact = readRow(headers, mapping, [
    "Dave Bone", "07700 900111", "dave@example.com", "yes", "14/02/1981", "regular, prefers Kerry",
  ]);

  assert.equal(contact.name, "Dave Bone");
  assert.equal(contact.phone, "07700 900111");
  assert.equal(contact.marketingSms, true);
  assert.equal(contact.marketingEmail, null, "nothing said about email is not a no");

  // The two we have nowhere typed for, kept under their own headings.
  assert.match(contact.notes ?? "", /DOB: 14\/02\/1981/);
  assert.match(contact.notes ?? "", /Tags: regular, prefers Kerry/);
});

test("two halves of a name make one", () => {
  const headers = ["First Name", "Last Name", "Mobile Number"];
  const contact = readRow(headers, guessColumns(headers), ["Jo", "Okafor", "07700 900222"]);
  assert.equal(contact.name, "Jo Okafor");
});

/*
 * A block has to say something. "Blocked" with no reason still puts a warning
 * on the record, or the business sees a flag it cannot act on.
 */
test("blocked becomes a warning anybody can read", () => {
  const headers = ["Full Name", "Blocked", "Block reason", "Mobile Number"];
  const mapping = guessColumns(headers);

  const banned = readRow(headers, mapping, ["Dave", "yes", "Three no-shows", "07700 900333"]);
  assert.equal(banned.alert, "Blocked in their old system: Three no-shows");

  const bare = readRow(headers, mapping, ["Jo", "yes", "", "07700 900444"]);
  assert.equal(bare.alert, "Blocked in their old system");

  const fine = readRow(headers, mapping, ["Sam", "no", "", "07700 900555"]);
  assert.equal(fine.alert, null);
});

test("somebody with no way to reach them is not brought in", () => {
  assert.equal(whyNot({ name: "Jo", phone: "07700 900111", email: null, alert: null, notes: null, marketingEmail: null, marketingSms: null }), null);
  assert.match(
    whyNot({ name: "Jo", phone: null, email: null, alert: null, notes: null, marketingEmail: null, marketingSms: null }) ?? "",
    /No way to reach them/,
  );
  assert.match(
    whyNot({ name: null, phone: null, email: null, alert: null, notes: null, marketingEmail: null, marketingSms: null }) ?? "",
    /No name, number or email/,
  );
});

/*
 * A number is unique per business in the database, so a duplicate in the file
 * is not a second record — it is one failed insert and a row nobody can
 * explain. Matched the way the phone column is stored: flattened.
 */
test("the same person written twice is the same person", () => {
  const one = { name: "Dave", phone: "07700 900111", email: null, alert: null, notes: null, marketingEmail: null, marketingSms: null };
  const two = { name: "David Bone", phone: "+44 7700 900111", email: null, alert: null, notes: null, marketingEmail: null, marketingSms: null };
  assert.equal(keyOf(one), keyOf(two));

  const byEmail = { name: "Jo", phone: null, email: "JO@Example.com ", alert: null, notes: null, marketingEmail: null, marketingSms: null };
  assert.equal(keyOf(byEmail), "e:jo@example.com");

  assert.equal(
    keyOf({ name: "Nobody", phone: null, email: null, alert: null, notes: null, marketingEmail: null, marketingSms: null }),
    null,
  );
});

/*
 * A whole file, with everything a real export has in it: quoted commas inside
 * an address, a doubled quote inside a note, the same person twice in two
 * different phone formats, a blank row, somebody with no name, somebody with
 * no number, and two columns of marketing ticks where one person left both
 * blank.
 *
 * Written after running an actual Fresha-shaped file through it, because the
 * per-function tests above all passed while none of them proved a file works.
 */
const MESSY = [
  "ID,First Name,Last Name,Full Name,Blocked,Block reason,Mobile Number,Email,Accepts Marketing,Accepts SMS,Address,DOB,Tags",
  '1001,Dave,Bone,Dave Bone,No,,07700 900301,dave@example.com,Yes,Yes,"12 Mill Lane, Bath",14/02/1981,"regular, prefers Kerry"',
  "1002,Tom,Whitfield,Tom Whitfield,Yes,Three no-shows,07700 900304,,No,No,,,",
  "1003,Nula,Byrne,Nula Byrne,No,,,nula@example.com,Yes,Yes,,30/07/1988,",
  "1004,,,,No,,,,No,No,,,",
  "1005,Dave,Bone,Dave Bone,No,,+44 7700 900301,dave@example.com,Yes,Yes,,,duplicate",
  `1006,Meg,O'Shea,Meg O'Shea,No,,07700 900309,meg@example.com,,,"22 Larkhall",,`,
].join("\n");

test("a real export, start to finish", () => {
  const { headers, rows } = readCsv(MESSY);
  const mapping = guessColumns(headers);
  assert.equal(rows.length, 6, "the blank row is still a row until it is read");

  const seen = new Set<string>();
  const brought: string[] = [];
  let skipped = 0;
  let already = 0;

  for (const row of rows) {
    const contact = readRow(headers, mapping, row);
    if (whyNot(contact)) {
      skipped++;
      continue;
    }
    const key = keyOf(contact);
    if (key && seen.has(key)) {
      already++;
      continue;
    }
    if (key) seen.add(key);
    brought.push(contact.name ?? "(no name)");
  }

  assert.deepEqual(brought, ["Dave Bone", "Tom Whitfield", "Nula Byrne", "Meg O'Shea"]);
  assert.equal(already, 1, "the same Dave, written two ways, is one Dave");
  assert.equal(skipped, 1, "the row with nothing in it");

  // And the details that are easy to get wrong.
  const dave = readRow(headers, mapping, rows[0]);
  assert.match(dave.notes ?? "", /Address: 12 Mill Lane, Bath/, "a comma inside an address survives");
  assert.match(dave.notes ?? "", /Tags: regular, prefers Kerry/);

  const tom = readRow(headers, mapping, rows[1]);
  assert.equal(tom.alert, "Blocked in their old system: Three no-shows");
  assert.equal(tom.email, null);

  const meg = readRow(headers, mapping, rows[5]);
  assert.equal(meg.marketingEmail, null, "blank is not a no");
  assert.equal(meg.marketingSms, null);
  assert.equal(meg.name, "Meg O'Shea", "an apostrophe is a name, not a quote");
});
