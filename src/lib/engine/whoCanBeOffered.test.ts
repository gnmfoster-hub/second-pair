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

// ------------------------- the website routes; a private number never does

test("a private channel books only them, until they say otherwise", () => {
  /*
   * The website is the shop window: one address, speaking for whoever the
   * owner has chosen. Every other channel is somebody's own — a text to one
   * person's number, an Instagram message to one person's account — and the
   * person on the other end is asking that person.
   *
   * So "only me" is what everybody has on their own channels until they choose
   * something else, and that is the important half of this.
   *
   * It used to be the rule rather than the default: the setting was read on
   * the web link and forced to "only me" everywhere else, so a stylist who
   * chose "me first, then anyone" got it on her booking page and not on her
   * own number — which is the channel she was picturing when she chose it. It
   * was saved, shown back to her, and overridden.
   */
  const guarded = person("dave", { agent_scope: "only_me" });

  for (const channel of ["sms", "whatsapp", "instagram", "messenger", "email"]) {
    const offered = whoCanBeOffered(everyone, {}, guarded, channel);
    assert.deepEqual(names(offered), ["dave"], `${channel} offered somebody else`);
  }

  // And the default, which is what nearly every business has.
  const unset = person("dave", {});
  assert.deepEqual(names(whoCanBeOffered(everyone, {}, unset, "sms")), ["dave"]);
});

test("somebody who has chosen to cover is offered help on their own number too", () => {
  /*
   * A stylist fully booked in August would rather her regulars were offered Mo
   * than told no. She is the one who decides that, and she decides it once,
   * for her channels — not once for her link and separately for her phone.
   */
  const covering = person("dave", { agent_scope: "anyone" });

  for (const channel of ["web", "sms", "whatsapp", "instagram", "messenger", "email"]) {
    const offered = whoCanBeOffered(everyone, {}, covering, channel);
    assert.ok(names(offered).length > 1, `${channel} still refused to offer anybody else`);
    assert.equal(names(offered)[0], "dave", `${channel} did not put them first`);
  }
});

test("the business widget still routes when nobody owns the channel", () => {
  // No forArtist means the shop window, whatever the channel is called.
  assert.deepEqual(names(whoCanBeOffered(everyone, {}, null, "web")), [
    "dave", "nadia", "apprentice",
  ]);
});

/*
 * The apprentice with a diary and no customers.
 *
 * What an owner asks for the moment there are two of them: the second person
 * takes the work the owner hands them, and is not somebody a stranger books.
 */
test("somebody the assistant may not book is never offered, on any channel", () => {
  const apprentice = person("apprentice", { assistant_books: false });
  const team = [dave, apprentice];

  assert.deepEqual(names(whoCanBeOffered(team, {})), ["dave"]);
  assert.deepEqual(names(whoCanBeOffered(team, { offers_artists: [apprentice.id] })), ["dave"]);
  // Not even on a link or a number of their own.
  assert.deepEqual(names(whoCanBeOffered(team, {}, apprentice)), []);
  assert.deepEqual(names(whoCanBeOffered(team, {}, apprentice, "sms")), []);
});

test("saying nothing about it means yes, as it always did", () => {
  assert.deepEqual(names(whoCanBeOffered([dave, person("nadia", { assistant_books: true })], {})), [
    "dave",
    "nadia",
  ]);
});
