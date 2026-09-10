import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signState,
  readState,
  newNonce,
  authoriseUrl,
  accountsFrom,
  SCOPES,
} from "./metaConnect.ts";

const SECRET = "server-side-secret";
const STUDIO = "49267816-62c3-4982-b747-dbf78c9182a9";
const NOW = Date.UTC(2026, 8, 10, 12, 0, 0);

const state = (at = NOW) => ({ studioId: STUDIO, nonce: "abc123", at });

// -------------------------------------------------------------------- state

test("a state we signed comes back as what we put in", () => {
  const got = readState(signState(state(), SECRET), SECRET, NOW);
  assert.deepEqual(got, state());
});

test("a state signed with a different secret is refused", () => {
  assert.equal(readState(signState(state(), "somebody else"), SECRET, NOW), null);
});

test("changing the business it names breaks the signature", () => {
  // The attack this exists to stop: sending somebody a link that attaches
  // their Facebook Page to a business that is not theirs.
  const token = signState(state(), SECRET);
  const [body, mac] = token.split(".");
  const tampered = Buffer.from(
    JSON.stringify({ ...state(), studioId: "somebody-elses-studio" }),
    "utf8",
  ).toString("base64url");
  assert.equal(readState(`${tampered}.${mac}`, SECRET, NOW), null);
  // And the original still reads, so the test is testing the tampering.
  assert.ok(readState(`${body}.${mac}`, SECRET, NOW));
});

test("an old state is refused however well signed", () => {
  const old = signState(state(NOW - 16 * 60 * 1000), SECRET);
  assert.equal(readState(old, SECRET, NOW), null);
});

test("a state from the future is refused too", () => {
  const ahead = signState(state(NOW + 5 * 60 * 1000), SECRET);
  assert.equal(readState(ahead, SECRET, NOW), null);
});

test("rubbish in the state is refused rather than thrown at", () => {
  for (const bad of ["", "nodot", "a.b", "....", "!!!.???"]) {
    assert.equal(readState(bad, SECRET, NOW), null, bad);
  }
});

test("with no secret set, nothing is accepted at all", () => {
  assert.equal(readState(signState(state(), SECRET), "", NOW), null);
});

test("every nonce differs", () => {
  const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
  assert.equal(seen.size, 50);
});

// ----------------------------------------------------------------- the link

test("the authorise link carries what Facebook needs and nothing odd", () => {
  const url = new URL(
    authoriseUrl({
      appId: "1234567890",
      redirectUri: "https://www.second-pair.com/api/meta/connect/callback",
      state: "signed-state",
    }),
  );
  assert.equal(url.hostname, "www.facebook.com");
  assert.equal(url.searchParams.get("client_id"), "1234567890");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "signed-state");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://www.second-pair.com/api/meta/connect/callback",
  );
});

test("we ask for messaging and nothing that touches posts or adverts", () => {
  // Every extra permission is another line on the screen where a business
  // decides whether to trust us, and another thing to justify at review.
  for (const scope of SCOPES) {
    assert.doesNotMatch(scope, /ads|insights|publish|read_engagement/, scope);
  }
  assert.ok(SCOPES.includes("pages_messaging"));
  assert.ok(SCOPES.includes("instagram_manage_messages"));
});

// -------------------------------------------------------------- what they gave

test("a page with Instagram attached becomes two connections", () => {
  const got = accountsFrom({
    data: [
      {
        id: "PAGE1",
        name: "Living Canvas Tattoo",
        access_token: "page-token",
        instagram_business_account: { id: "IG1", username: "livingcanvas" },
      },
    ],
  });
  assert.equal(got.length, 2);
  assert.deepEqual(got[0], {
    channel: "messenger",
    externalId: "PAGE1",
    label: "Living Canvas Tattoo",
    token: "page-token",
  });
  assert.equal(got[1].channel, "instagram");
  assert.equal(got[1].externalId, "IG1");
  assert.equal(got[1].label, "@livingcanvas");
});

test("a page with no Instagram gives one", () => {
  const got = accountsFrom({
    data: [{ id: "PAGE1", name: "A Page", access_token: "t" }],
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].channel, "messenger");
});

test("somebody who ticked two pages gets both", () => {
  const got = accountsFrom({
    data: [
      { id: "P1", name: "Shop", access_token: "t1" },
      { id: "P2", name: "Side project", access_token: "t2" },
    ],
  });
  assert.equal(got.length, 2);
  // Each carries its own token: a Page token only works for that Page, which
  // is exactly the blast radius we want.
  assert.notEqual(got[0].token, got[1].token);
});

test("a page with no token is skipped rather than half connected", () => {
  const got = accountsFrom({ data: [{ id: "P1", name: "No token" }] });
  assert.deepEqual(got, []);
});

test("rubbish gives nothing out rather than throwing", () => {
  for (const bad of [null, undefined, {}, { data: "no" }, { data: [null] }, 7]) {
    assert.deepEqual(accountsFrom(bad), [], JSON.stringify(bad));
  }
});
