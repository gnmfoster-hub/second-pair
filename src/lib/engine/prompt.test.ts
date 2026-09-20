import { test } from "node:test";
import assert from "node:assert/strict";
import { studioSystemPrompt } from "./prompt.ts";
import type { Studio } from "../types.ts";

/*
 * The prompt is where the assistant is told what is true about a business, and
 * it is assembled from a dozen conditional pieces. Two of those pieces
 * disagreed for weeks and nothing caught it, because the only way to see it was
 * to read a whole prompt for one particular combination of settings.
 *
 * A salon customer was told, two messages apart, that the deposit was optional
 * and her booking stood whether she paid or not, and then that her slot was
 * held until she paid. She cannot act on both. Somebody who believes the slot
 * is conditional and cannot pay that evening does not turn up.
 */
const studio = (deposit_mode: Studio["deposit_mode"]): Studio =>
  ({
    id: "s1",
    name: "Willow & Co",
    slug: "willow",
    vertical: "salon",
    timezone: "Europe/London",
    deposit_mode,
    deposit_rule: "£20 deposit, refundable up to 48 hours before.",
    assistant_name: "Robin",
    hours: [{ day: 2, open: "09:00", close: "17:00", closed: false }],
    /*
     * Connected, because a business that cannot actually take money is told to
     * take no deposits whatever its setting says — which is right, and would
     * have made every one of these pass for the wrong reason.
     */
    stripe_account_id: "acct_test",
    payment_model: "business",
    // Only the fields this prompt reads. Spelling out all sixty would say
    // nothing true about what is being tested.
  }) as unknown as Studio;

const promptFor = (mode: Studio["deposit_mode"]) =>
  studioSystemPrompt(studio(mode), [], [], [], []);

test("an optional deposit is never described as holding the slot", () => {
  const text = promptFor("optional");
  assert.match(text, /stands whether or not they pay/);
  assert.doesNotMatch(text, /slot is held until it is paid/);
  assert.doesNotMatch(text, /only held once it is paid/);
});

test("a required deposit says plainly that it holds the slot", () => {
  const text = promptFor("required");
  assert.match(text, /held until it is paid|only held once it is paid/);
  assert.doesNotMatch(text, /stands whether or not they pay/);
});

test("a business that takes no deposit is never told how to take one", () => {
  const text = promptFor("none");
  assert.doesNotMatch(text, /send_deposit_link/);
  assert.match(text, /does not take deposits/);
});

test("a business with no tone written down is still given a voice", () => {
  const bare = { ...studio("none"), tone: null } as unknown as Studio;
  const text = studioSystemPrompt(bare, [], [], [], []);
  assert.doesNotMatch(text, /# Voice\nundefined/);
  assert.doesNotMatch(text, /undefined/);
});

/*
 * A chair renter is a business inside a business.
 *
 * Aisha rents a chair at Willow & Co and trades as Hair by Aisha. Her clients
 * found her, not the salon, and on her own number the assistant was
 * introducing itself as the salon.
 */
test("on her own channel the assistant answers for her, not the salon", () => {
  const text = studioSystemPrompt(
    studio("none"),
    [],
    [],
    [],
    [],
    {},
    { name: "Aisha", trading_name: "Hair by Aisha at Willow & Co" } as never,
  );

  assert.match(text, /receptionist for Hair by Aisha at Willow & Co/);
  assert.match(text, /Never offer a colleague/);
});

test("without one of her own it is still the salon's name", () => {
  const text = studioSystemPrompt(studio("none"), [], [], [], [], {}, { name: "Aisha" } as never);
  assert.match(text, /receptionist for Willow & Co/);
  assert.doesNotMatch(text, /Never offer a colleague/);
});

/* And the salon's own channels are unchanged by any of it. */
test("the salon's own channel is answered for the salon", () => {
  const text = studioSystemPrompt(studio("none"), [], [], [], []);
  assert.match(text, /receptionist for Willow & Co/);
  assert.doesNotMatch(text, /trades as/);
});
