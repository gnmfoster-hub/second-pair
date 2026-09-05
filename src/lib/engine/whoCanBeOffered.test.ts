import { test } from "node:test";
import assert from "node:assert/strict";
import { whoCanBeOffered } from "./offering.ts";
import type { Artist } from "../types.ts";

const person = (id: string, over: Partial<Artist> = {}): Artist =>
  ({ id, name: id, active: true, agent_scope: "only_me", ...over }) as Artist;

const dave = person("dave");
const nadia = person("nadia");
const apprentice = person("apprentice");
const gone = person("gone", { active: false });
const everyone = [dave, nadia, apprentice, gone];

const names = (list: Artist[]) => list.map((a) => a.id);

// ------------------------------------------------- the business's own widget

test("by default the business assistant offers everyone working", () => {
  // What every business has today. Adding the setting must change nothing
  // until somebody uses it.
  assert.deepEqual(names(whoCanBeOffered(everyone, {})), ["dave", "nadia", "apprentice"]);
});

test("somebody who has left is never offered", () => {
  assert.ok(!names(whoCanBeOffered(everyone, {})).includes("gone"));
});

test("the owner can choose who the website offers", () => {
  /*
   * A stylist who only takes her own regulars, or an apprentice not ready for
   * the website. Before this, adding somebody to the diary started selling
   * their time to strangers.
   */
  const offered = whoCanBeOffered(everyone, { offers_artists: [dave.id] });
  assert.deepEqual(names(offered), ["dave"]);
});

test("choosing somebody who has since left does not offer them", () => {
  const offered = whoCanBeOffered(everyone, { offers_artists: [gone.id, dave.id] });
  assert.deepEqual(names(offered), ["dave"]);
});

test("an empty choice means everyone, not nobody", () => {
  /*
   * A business whose assistant can offer no one cannot answer at all, which is
   * far more likely to be a mistake than an intention — and it would be a
   * silent one, since the widget still opens.
   */
  assert.deepEqual(names(whoCanBeOffered(everyone, { offers_artists: [] })), [
    "dave", "nadia", "apprentice",
  ]);
  assert.deepEqual(names(whoCanBeOffered(everyone, { offers_artists: [gone.id] })), [
    "dave", "nadia", "apprentice",
  ]);
});

// ---------------------------------------------------- somebody's own link

test("a personal link offers only that person by default", () => {
  // What every personal link does today. Somebody who scanned a code on
  // Nadia's card is asking for Nadia.
  const offered = whoCanBeOffered(everyone, {}, nadia);
  assert.deepEqual(names(offered), ["nadia"]);
});

test("set to cover for others, they come first and others follow", () => {
  const offered = whoCanBeOffered(everyone, {}, person("nadia", { agent_scope: "me_first" }));
  assert.equal(names(offered)[0], "nadia", "they must be offered first");
  assert.ok(names(offered).includes("dave"));
});

test("a receptionist's link can offer anybody", () => {
  const offered = whoCanBeOffered(everyone, {}, person("dave", { agent_scope: "anyone" }));
  assert.ok(names(offered).length > 1);
});

test("a personal link ignores the business's own choice", () => {
  /*
   * Deliberate. The website list is about what the shop advertises; somebody
   * handing out their own card is a different question, and being left off the
   * website must not stop their own link working.
   */
  const offered = whoCanBeOffered(
    everyone,
    { offers_artists: [dave.id] },
    person("nadia", { agent_scope: "me_first" }),
  );
  assert.equal(names(offered)[0], "nadia");
});

test("someone who has left is not offered even on their own link", () => {
  assert.deepEqual(names(whoCanBeOffered(everyone, {}, gone)), []);
});
