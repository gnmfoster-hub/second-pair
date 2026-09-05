import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "./csv.ts";

const body = (csv: string) => csv.replace("﻿", "").trimEnd().split("\r\n");

test("plain rows come out plainly", () => {
  assert.deepEqual(body(toCsv(["Name", "Phone"], [["Kim", "07700 900123"]])), [
    "Name,Phone",
    "Kim,07700 900123",
  ]);
});

test("a comma in a name does not become a new column", () => {
  const [, row] = body(toCsv(["Name"], [["Smith, Kim"]]));
  assert.equal(row, '"Smith, Kim"');
});

test("a quote inside a field is doubled, not dropped", () => {
  const [, row] = body(toCsv(["Note"], [['She said "no colour"']]));
  assert.equal(row, '"She said ""no colour"""');
});

test("a line break stays inside its own cell", () => {
  const csv = toCsv(["Note"], [["Cancelled twice.\nTake a deposit."]]);
  assert.ok(csv.includes('"Cancelled twice.\nTake a deposit."'));
});

test("nothing is written for nothing", () => {
  assert.deepEqual(body(toCsv(["A", "B"], [[null, undefined]])), ["A,B", ","]);
});

// ------------------------------------ the one that matters to whoever opens it

test("a phone number is not read as a formula", () => {
  /*
   * "+447700900123" opens as a broken formula rather than a number, which is
   * the ordinary case for a client list.
   */
  const [, row] = body(toCsv(["Phone"], [["+447700900123"]]));
  assert.ok(row.startsWith("'"), `${row} would be evaluated`);
});

test("a note beginning with = cannot run on open", () => {
  /*
   * Anything a customer typed ends up in this file. A cell starting with = is
   * executed by a spreadsheet, so a note is a way to attack whoever opens the
   * export — usually the business owner.
   */
  for (const nasty of ["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "=HYPERLINK(\"http://x\")"]) {
    const [, row] = body(toCsv(["Note"], [[nasty]]));
    const cell = row.startsWith('"') ? row.slice(1) : row;
    assert.ok(cell.startsWith("'"), `${nasty} was left executable`);
  }
});

test("it opens as UTF-8 rather than as mojibake", () => {
  // Without the mark Excel reads a UTF-8 file as the local codepage, and
  // somebody's name is spelled wrong in the file they were given to keep.
  const csv = toCsv(["Name"], [["Siân"]]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("Siân"));
});

test("rows end the way a spreadsheet expects", () => {
  assert.ok(toCsv(["A"], [["1"]]).endsWith("\r\n"));
});
