import { test } from "node:test";
import assert from "node:assert/strict";
import { readHex, contrast, autoText, paint } from "./colour.ts";

test("a colour written the way people write colours", () => {
  assert.equal(readHex("#14243F"), "14243f");
  assert.equal(readHex("14243f"), "14243f");
  assert.equal(readHex("  #14243F  "), "14243f");
});

test("three digits is how most people write white", () => {
  assert.equal(readHex("#fff"), "ffffff");
  assert.equal(readHex("#000"), "000000");
  assert.equal(readHex("f07"), "ff0077");
});

test("anything that is not a colour is not guessed at", () => {
  for (const bad of ["", "white", "#ff", "#fffff", "#gggggg", "rgb(1,2,3)"]) {
    assert.equal(readHex(bad), null, bad);
  }
});

test("contrast is the way round the eye sees it", () => {
  assert.equal(Math.round(contrast("000000", "ffffff")), 21);
  assert.equal(contrast("123456", "123456"), 1);
});

test("white on navy, ink on a pale yellow", () => {
  assert.equal(autoText("14243f"), "ffffff");
  assert.equal(autoText("ffe066"), "17150f");
});

test("a bright green gets ink, which a plain average would get wrong", () => {
  // Green is the channel the eye is most sensitive to. Averaging the three
  // channels calls 00ff00 mid-dark and puts white on it.
  assert.equal(autoText("00ff00"), "17150f");
});

test("nothing chosen is our navy in white", () => {
  const p = paint(null, null);
  assert.equal(p.fill, "14243f");
  assert.equal(p.text, "ffffff");
  assert.equal(p.readable, true);
});

test("a chosen text colour is used even when the automatic one differs", () => {
  const p = paint("14243f", "ffe066");
  assert.equal(p.text, "ffe066");
});

test("a choice that will be hard to read is reported, not refused", () => {
  const p = paint("ffe066", "ffffff");
  assert.equal(p.text, "ffffff");
  assert.equal(p.readable, false);
  assert.ok(p.ratio < 2, `expected a poor ratio, got ${p.ratio}`);
});

test("white on white is the worst case and is not silently corrected", () => {
  const p = paint("ffffff", "ffffff");
  assert.equal(p.ratio, 1);
  assert.equal(p.readable, false);
});

test("white as a button colour gets near-black writing on its own", () => {
  const p = paint("ffffff", null);
  assert.equal(p.text, "17150f");
  assert.equal(p.readable, true);
});
