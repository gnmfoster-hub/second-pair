import { test } from "node:test";
import assert from "node:assert/strict";
import { geometry, bubbleColours, lineFor, isShape, isSize, isBubble } from "./look.ts";

test("a bigger button carries bigger writing and a bigger mark", () => {
  const small = geometry("small", "round");
  const large = geometry("large", "round");
  assert.ok(large.height > small.height);
  assert.ok(large.icon > small.icon);
  assert.ok(large.font >= small.font);
});

test("writing never shrinks past the point of being read", () => {
  for (const size of ["small", "medium", "large"] as const) {
    const g = geometry(size, "round");
    assert.ok(g.font >= 12.5, `${size} font ${g.font}`);
    assert.ok(g.font <= 14.5, `${size} font ${g.font}`);
  }
});

test("round is a pill whatever size it is", () => {
  assert.equal(geometry("small", "round").radius, "999px");
  assert.equal(geometry("large", "round").radius, "999px");
});

test("square is softened, because a true right angle reads as unstyled", () => {
  assert.equal(geometry("medium", "square").radius, "8px");
  assert.notEqual(geometry("medium", "square").radius, "0");
});

test("the nudge comes in both flavours a website does", () => {
  assert.notEqual(bubbleColours("light").fill, bubbleColours("dark").fill);
  assert.notEqual(bubbleColours("light").text, bubbleColours("dark").text);
});

test("with nothing written, the line is the one worked out from the hours", () => {
  assert.equal(lineFor("Answering now", true, {}), "Answering now");
  assert.equal(lineFor("Closed — I can still book you", false, {}), "Closed — I can still book you");
});

test("their words win, and only for the state they wrote them for", () => {
  const said = { open: "We're in the shop", closed: "Shut, but ask away" };
  assert.equal(lineFor("Answering now", true, said), "We're in the shop");
  assert.equal(lineFor("Closed — I can still book you", false, said), "Shut, but ask away");
});

test("an override for the other state does not leak into this one", () => {
  assert.equal(lineFor("Answering now", true, { closed: "Shut" }), "Answering now");
});

test("whitespace is not an override", () => {
  assert.equal(lineFor("Answering now", true, { open: "   " }), "Answering now");
  assert.equal(lineFor("Answering now", true, { open: null }), "Answering now");
});

test("a line too long for the button is cut rather than smeared across it", () => {
  const essay = "We are open right now and would absolutely love to hear from you today";
  assert.equal(lineFor("Answering now", true, { open: essay }).length, 48);
});

test("only the three shapes, sizes and flavours that exist", () => {
  assert.equal(isShape("round"), true);
  assert.equal(isShape("triangle"), false);
  assert.equal(isSize("large"), true);
  assert.equal(isSize("enormous"), false);
  assert.equal(isBubble("dark"), true);
  assert.equal(isBubble("beige"), false);
});
