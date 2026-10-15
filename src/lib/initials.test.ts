import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsFor } from "./initials.ts";

/*
 * These go on the widget launcher now, so they are the first thing a visitor
 * sees of a business. Every name here is a real one off the live database
 * except the last two.
 */

test("the one that was wrong", () => {
  // First word and last word, with the last word being "(demo)".
  assert.equal(initialsFor("Willow & Co (demo)"), "WC");
});

test("the live businesses", () => {
  assert.equal(initialsFor("Amber's Paws & Pastures"), "AP");
  assert.equal(initialsFor("Neat & Tidy Solutions"), "NS");
  assert.equal(initialsFor("Living Canvas Tattoo"), "LT");
  assert.equal(initialsFor("Second Pair"), "SP");
  assert.equal(initialsFor("Cogs & Co Garage"), "CG");
});

test("a person, which is what it was written for", () => {
  assert.equal(initialsFor("Amber Hurden"), "AH");
  assert.equal(initialsFor("Julie Koch"), "JK");
});

test("one word gives two letters of it", () => {
  assert.equal(initialsFor("Kerbside"), "KE");
  assert.equal(initialsFor("bebe"), "BE");
});

test("punctuation never becomes a letter", () => {
  assert.equal(initialsFor("Brightwork Plastering & Rendering"), "BR");
  assert.equal(initialsFor("Dan's Driving School -"), "DS");
  assert.equal(initialsFor("Ashcroft Electrical (new)"), "AE");
});

test("a name with no letters in it still says something", () => {
  // Better two characters of what they typed than a question mark.
  assert.equal(initialsFor("&&"), "&&");
  assert.equal(initialsFor("   "), "?");
  assert.equal(initialsFor(""), "?");
});

test("an accented name keeps its own letter", () => {
  assert.equal(initialsFor("Émile Chevalier"), "ÉC");
  assert.equal(initialsFor("Ørsted Studio"), "ØS");
});
