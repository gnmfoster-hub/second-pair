import { test } from "node:test";
import assert from "node:assert/strict";
import { probeEmail } from "./email.ts";

/*
 * The probe talks to Resend, so these cover the paths that do not: the ones
 * that were wrong in the first place. Whether a live key is any good is not a
 * thing a test can know, and pretending otherwise is how the original check
 * came to say yes when the answer was no.
 */

function withEnv(env: Record<string, string | undefined>, run: () => Promise<void>) {
  const before = { RESEND_API_KEY: process.env.RESEND_API_KEY, EMAIL_FROM: process.env.EMAIL_FROM };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  return run().finally(() => {
    process.env.RESEND_API_KEY = before.RESEND_API_KEY;
    process.env.EMAIL_FROM = before.EMAIL_FROM;
    if (before.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    if (before.EMAIL_FROM === undefined) delete process.env.EMAIL_FROM;
  });
}

test("with no key it says so, rather than saying the key is bad", async () => {
  await withEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: "hello@example.com" }, async () => {
    const probe = await probeEmail();
    assert.equal(probe.keyAccepted, null);
    assert.equal(probe.senderVerified, null);
    assert.match(probe.detail ?? "", /not set/);
  });
});

test("with no sender address there is nothing to verify against", async () => {
  await withEnv({ RESEND_API_KEY: "re_whatever", EMAIL_FROM: undefined }, async () => {
    const probe = await probeEmail();
    assert.equal(probe.senderDomain, null);
    assert.equal(probe.keyAccepted, null);
  });
});

test("the domain is read out of the address, case and spacing aside", async () => {
  await withEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: "Hello@Second-Pair.COM" }, async () => {
    assert.equal((await probeEmail()).senderDomain, "second-pair.com");
  });
});

test("a name in the address does not become the domain", async () => {
  await withEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: "bookings@mail.second-pair.com" }, async () => {
    assert.equal((await probeEmail()).senderDomain, "mail.second-pair.com");
  });
});

test("unreachable is not the same as refused", async () => {
  await withEnv(
    { RESEND_API_KEY: "re_whatever", EMAIL_FROM: "hello@example.com" },
    async () => {
      // One millisecond is not enough to reach anybody, which is the point:
      // the answer must be "could not ask", never "the key is bad".
      const probe = await probeEmail(1);
      assert.equal(probe.keyAccepted, null);
      assert.match(probe.detail ?? "", /Could not reach Resend/);
    },
  );
});
