import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBlocks, expandRepeats, countsFrom, instanceId, type Block } from "./blocks.ts";
import { whatToSave } from "./fieldRoles.ts";

/**
 * A repeating group is the one part of a form that changes shape after it has
 * been sent, so most of this is about the shape staying honest: one dog has to
 * read exactly as one dog did before any of this existed, and three dogs must
 * not quietly become one.
 */

const dogs: Block = {
  id: "dog",
  type: "repeat",
  label: "Your dogs",
  each: "Dog",
  addLabel: "Add another dog",
  children: [
    { id: "n", type: "short", label: "Name", required: true },
    { id: "b", type: "short", label: "Breed", role: "fact:breed" },
    { id: "w", type: "yesno", label: "Anything to watch for", role: "alert", detailOnYes: true },
    { id: "o", type: "short", label: "Owner", role: "name" },
  ],
};

test("one of them reads exactly as a plain form does", () => {
  const out = expandRepeats([dogs], { dog: 1 });
  const ids = out.map((b) => b.id);
  assert.deepEqual(ids, ["dog__h", "n", "b", "w", "o"]);
  assert.equal(out[1].label, "Name", "no numbering when there is only one");
  assert.equal(out[2].role, "fact:breed");
});

test("the second one gets its own keys and its own fact", () => {
  const out = expandRepeats([dogs], { dog: 2 });
  assert.deepEqual(
    out.map((b) => b.id),
    ["dog__h", "n", "b", "w", "o", "dog__h~2", "n~2", "b~2", "w~2", "o~2"],
  );
  assert.equal(out[2].role, "fact:breed");
  assert.equal(out[7].role, "fact:breed_2", "or the second dog overwrites the first");
});

test("the labels say which one, once there is more than one", () => {
  const out = expandRepeats([dogs], { dog: 2 });
  assert.equal(out[0].label, "Dog 1");
  assert.equal(out[1].label, "Dog 1: Name");
  assert.equal(out[6].label, "Dog 2: Name");
});

/* Nobody has two names. */
test("a detail about the person is only taken from the first", () => {
  const out = expandRepeats([dogs], { dog: 3 });
  const owners = out.filter((b) => b.role === "name");
  assert.equal(owners.length, 1);
  assert.equal(owners[0].id, "o");
});

/* "The second dog bites" is the thing that must not be lost. */
test("every one of them can raise an alert", () => {
  const out = expandRepeats([dogs], { dog: 3 });
  assert.equal(out.filter((b) => b.role === "alert").length, 3);
});

test("a count that arrived from nowhere is brought back into range", () => {
  assert.equal(expandRepeats([dogs], { dog: 999 }).filter((b) => b.id.startsWith("n")).length, 6);
  assert.equal(expandRepeats([dogs], { dog: 0 }).filter((b) => b.id === "n").length, 1);
  assert.equal(expandRepeats([dogs], {}).filter((b) => b.id === "n").length, 1);
  assert.equal(expandRepeats([dogs], { dog: -4 }).filter((b) => b.id === "n").length, 1);
});

test("everything else is left exactly where it was", () => {
  const form: Block[] = [
    { id: "intro", type: "text", label: "Hello" },
    dogs,
    { id: "sign", type: "signature", label: "Signature", required: true },
  ];
  const out = expandRepeats(form, { dog: 2 });
  assert.equal(out[0].id, "intro");
  assert.equal(out[out.length - 1].id, "sign");
});

/* ----------------------------------------------------------- the boundary */

test("a group with nothing in it is dropped", () => {
  assert.deepEqual(cleanBlocks([{ id: "x", type: "repeat", label: "Empty", children: [] }]), []);
});

test("a group inside a group is refused", () => {
  const nested = cleanBlocks([
    {
      id: "outer",
      type: "repeat",
      label: "Outer",
      children: [
        { id: "a", type: "short", label: "Fine" },
        { id: "inner", type: "repeat", label: "Inner", children: [{ id: "b", type: "short", label: "No" }] },
      ],
    },
  ]);
  assert.equal(nested.length, 1);
  assert.deepEqual(nested[0].children?.map((c) => c.id), ["a"]);
});

test("a signature cannot hide inside a group", () => {
  const out = cleanBlocks([
    {
      id: "g",
      type: "repeat",
      label: "Group",
      children: [
        { id: "a", type: "short", label: "Fine" },
        { id: "s", type: "signature", label: "Sneaky" },
      ],
    },
  ]);
  assert.deepEqual(out[0].children?.map((c) => c.id), ["a"]);
});

/* ------------------------------------------------------------ the counts */

test("how many were asked for is read back off the answers", () => {
  assert.deepEqual(countsFrom({ __n_dog: "3", n: "Bramble" }), { dog: 3 });
  assert.deepEqual(countsFrom({ __n_dog: "nonsense" }), {});
  assert.deepEqual(countsFrom({ __n_dog: "99" }), { dog: 6 }, "capped the same way");
  assert.deepEqual(countsFrom(null), {});
});

test("the key for an instance is stable", () => {
  assert.equal(instanceId("b", 0), "b");
  assert.equal(instanceId("b", 1), "b~2");
});

/* -------------------------------------------- and it all reaches the record */

test("three dogs produce three breeds and three alerts, filed apart", () => {
  const out = expandRepeats([dogs], { dog: 3 });
  const save = whatToSave(
    out,
    {
      b: "Collie",
      "b~2": "Spaniel",
      "b~3": "Terrier",
      w: "no",
      "w~2": "yes",
      "w~2__detail": "Bites strangers",
      o: "Marie Whitlock",
    },
    {},
  );

  assert.deepEqual(save.facts, { breed: "Collie", breed_2: "Spaniel", breed_3: "Terrier" });
  assert.equal(save.person.name, "Marie Whitlock");
  assert.equal(save.alert, "Dog 2: Anything to watch for: Bites strangers");
  assert.ok(!/Dog 1/.test(save.alert ?? ""), "the one that is fine raises nothing");
});
