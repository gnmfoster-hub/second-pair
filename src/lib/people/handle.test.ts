import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFor, nameForHandle } from "./handle.ts";

test("an ordinary name gives its first name", () => {
  assert.equal(handleFor("Amy Fitch", []), "amy");
  assert.equal(handleFor("Karen Foster", []), "karen");
  assert.equal(handleFor("Aisha", []), "aisha");
});

/*
 * The one that was wrong. A garage naming people by where they stand got
 * "bay" and "bay-2" — two addresses saying nothing about either person, and
 * the second numbered for no reason a customer could see.
 */
test("a business that names people by where they stand", () => {
  assert.equal(handleFor("Bay 1 — Stevie", []), "stevie");
  assert.equal(handleFor("Bay 2 — Mark", []), "mark");
  assert.equal(handleFor("MOT bay — Pete", []), "pete");
  assert.equal(handleFor("Chair 3 - Priya", []), "priya");
});

test("a dash with no person after it falls back to the front", () => {
  assert.equal(nameForHandle("Dave Ashcroft - 2"), "Dave");
  assert.equal(handleFor("Dave Ashcroft - 2", []), "dave");
});

test("two Sarahs, which is not a rare problem in a salon", () => {
  assert.equal(handleFor("Sarah Webb", ["sarah"]), "sarah-2");
  assert.equal(handleFor("Sarah Cole", ["sarah", "sarah-2"]), "sarah-3");
});

test("accents and punctuation come out as something an address can hold", () => {
  assert.equal(handleFor("Zoë O'Brien", []), "zoe");
  // A hyphen inside a name is part of the name, not a separator.
  assert.equal(handleFor("Jean-Luc Marchand", []), "jean-luc");
  assert.equal(handleFor("", []), "team");
  assert.equal(handleFor("   ", []), "team");
});
