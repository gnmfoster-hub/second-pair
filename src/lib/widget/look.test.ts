import { test } from "node:test";
import assert from "node:assert/strict";
import {
  geometry,
  bubbleColours,
  lineFor,
  isShape,
  isSize,
  isBubble,
  isPulse,
  pulsePlan,
  fontStack,
  weightValue,
  surfaceLook,
  painted,
  isFont,
  isWeight,
  isSurface,
} from "./look.ts";

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

test("off means no pulse at all, not a quiet one", () => {
  assert.equal(pulsePlan("off"), null);
});

test("once does not repeat", () => {
  assert.equal(pulsePlan("once")?.every, 0);
  assert.equal(pulsePlan("once")?.until, 0);
});

test("always repeats, slowly, and stops by itself", () => {
  const plan = pulsePlan("always");
  assert.ok(plan);
  assert.ok(plan.every >= 4000, "a ring every few seconds, not every second");
  assert.ok(plan.until > plan.every, "it has to run more than once before stopping");
  assert.ok(plan.until <= 300000, "and it has to stop");
});

test("only the three settings that exist", () => {
  assert.equal(isPulse("always"), true);
  assert.equal(isPulse("strobe"), false);
});

test("matching the site means inheriting, not guessing at their font", () => {
  assert.equal(fontStack("site"), "inherit");
});

test("every other stack ends somewhere real, so nothing falls back to Times", () => {
  for (const font of ["system", "sans", "serif", "rounded", "mono"] as const) {
    const stack = fontStack(font);
    assert.match(stack, /sans-serif|serif|monospace$/, `${font}: ${stack}`);
  }
});

test("weights are the three a person can tell apart", () => {
  assert.equal(weightValue("regular"), 400);
  assert.equal(weightValue("medium"), 500);
  assert.equal(weightValue("bold"), 700);
});

test("an outlined button is not filled, and writes in the accent instead", () => {
  const look = surfaceLook("outline", "3dbec7");
  assert.equal(look.filled, false);
  assert.match(look.border, /#3dbec7/);
  assert.deepEqual(painted("outline", "3dbec7", "17150f"), {
    background: "transparent",
    colour: "#3dbec7",
  });
});

test("flat means no shadow at all, not a smaller one", () => {
  assert.equal(surfaceLook("flat", "3dbec7").shadow, "none");
});

test("raised keeps a shadow the ring animation can preserve", () => {
  assert.match(surfaceLook("raised", "3dbec7").shadow, /rgba/);
});

test("glass lets the page through and asks the browser to frost it", () => {
  const look = surfaceLook("glass", "3dbec7");
  assert.ok(look.blur);
  assert.match(painted("glass", "3dbec7", "17150f").background, /^#3dbec7/);
  assert.notEqual(painted("glass", "3dbec7", "17150f").background, "#3dbec7");
});

test("only the fonts, weights and surfaces that exist", () => {
  assert.equal(isFont("site"), true);
  assert.equal(isFont("comic"), false);
  assert.equal(isWeight("bold"), true);
  assert.equal(isWeight("heavy"), false);
  assert.equal(isSurface("glass"), true);
  assert.equal(isSurface("velvet"), false);
});
