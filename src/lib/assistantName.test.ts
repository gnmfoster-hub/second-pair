import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantName, DEFAULT_ASSISTANT_NAME } from "./assistantName.ts";

test("nobody has chosen, so it has the default name", () => {
  assert.equal(assistantName(null), DEFAULT_ASSISTANT_NAME);
  assert.equal(assistantName({ assistant_name: null }), DEFAULT_ASSISTANT_NAME);
});

test("the business's name is used when it has one", () => {
  assert.equal(assistantName({ assistant_name: "Milo" }), "Milo");
});

/*
 * A stylist with her own Instagram is not answered by the shop's assistant. As
 * far as that customer is concerned, she has somebody helping her.
 */
test("the person's own beats the business's on their own enquiries", () => {
  assert.equal(
    assistantName({ assistant_name: "Milo" }, { assistant_name: "Bea" }),
    "Bea",
  );
});

test("a person who has not chosen falls back to the business's", () => {
  assert.equal(assistantName({ assistant_name: "Milo" }, { assistant_name: null }), "Milo");
});

/*
 * A box somebody cleared and saved means "use the default". Stored as "", it
 * would otherwise produce an assistant that introduces itself as nothing.
 */
test("a cleared box is not a name", () => {
  assert.equal(assistantName({ assistant_name: "   " }), DEFAULT_ASSISTANT_NAME);
  assert.equal(
    assistantName({ assistant_name: "Milo" }, { assistant_name: "  " }),
    "Milo",
  );
});

test("a name keeps its own spacing trimmed, not its middle", () => {
  assert.equal(assistantName({ assistant_name: "  Anna Mae  " }), "Anna Mae");
});

/* Before the migration runs, the column is absent rather than null. */
test("an absent column behaves as unset", () => {
  assert.equal(assistantName({}, {}), DEFAULT_ASSISTANT_NAME);
});
