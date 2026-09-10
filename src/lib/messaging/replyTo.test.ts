import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { replyToFor, inboundDomain, canReceiveEmail } from "./replyTo.ts";

/**
 * Whether a customer hitting reply carries on the conversation, or ends it.
 *
 * Reply-To was the business's own address, which sounds right and quietly made
 * every email conversation exactly one exchange long: the assistant asks a
 * question, the reply goes to the owner's inbox, and nothing ever answers it.
 */

const studio = { slug: "neat-tidy-solutions", email: "info@neatandtidysolutions.co.uk" };

beforeEach(() => {
  delete process.env.EMAIL_WEBHOOK_SECRET;
  delete process.env.EMAIL_INBOUND_DOMAIN;
});

test("with inbound on, a reply comes back to the assistant", () => {
  process.env.EMAIL_WEBHOOK_SECRET = "anything";
  assert.equal(replyToFor(studio), "neat-tidy-solutions@in.second-pair.com");
});

/*
 * The secret is the honest signal: nothing is accepted at all without it, so a
 * reply sent to us would be discarded in silence. The business's own inbox is
 * worse than the assistant and far better than a hole.
 */
test("with inbound off, it falls back to the business rather than a void", () => {
  assert.equal(replyToFor(studio), "info@neatandtidysolutions.co.uk");
  assert.equal(canReceiveEmail(), false);
});

test("with inbound off and no address on file, nothing at all", () => {
  assert.equal(replyToFor({ slug: "x", email: null }), undefined);
});

test("it follows the configured receiving domain", () => {
  process.env.EMAIL_WEBHOOK_SECRET = "anything";
  process.env.EMAIL_INBOUND_DOMAIN = "Inbound.Second-Pair.com";
  assert.equal(inboundDomain(), "inbound.second-pair.com");
  assert.equal(replyToFor(studio), "neat-tidy-solutions@inbound.second-pair.com");
});

/*
 * The address has to be the one the inbound reader will match back to this
 * business, since it takes the slug from in front of the @. If these two ever
 * disagree, replies arrive and are filed against nobody.
 */
test("the local part is the slug the inbound reader looks for", () => {
  process.env.EMAIL_WEBHOOK_SECRET = "anything";
  const address = replyToFor(studio);
  assert.equal(address?.split("@")[0], studio.slug);
});

test("no slug means no address of ours to offer", () => {
  process.env.EMAIL_WEBHOOK_SECRET = "anything";
  assert.equal(replyToFor({ slug: "", email: null }), undefined);
});
