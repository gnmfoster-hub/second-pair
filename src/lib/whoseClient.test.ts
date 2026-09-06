import { test } from "node:test";
import assert from "node:assert/strict";
import { whoseClient } from "./whoseClient.ts";

const booking = (artist: string | null, day: string, cancelled = false) => ({
  artist_id: artist,
  starts_at: `${day}T10:00:00Z`,
  cancelled_at: cancelled ? "2026-01-01T00:00:00Z" : null,
});

const talk = (artist: string | null, enquiryArtist: string | null = null) => ({
  artist_id: artist,
  enquiries: enquiryArtist ? { artist_id: enquiryArtist } : null,
});

test("nobody, when there is nothing to go on", () => {
  assert.equal(whoseClient([], []), null);
  assert.equal(whoseClient([], [talk(null)]), null);
});

test("whoever has actually seen them", () => {
  assert.equal(whoseClient([booking("dave", "2026-03-01")], []), "dave");
});

test("the most recent appointment wins", () => {
  const out = whoseClient(
    [booking("dave", "2026-01-05"), booking("nadia", "2026-05-05")],
    [],
  );
  assert.equal(out, "nadia");
});

test("order given does not matter, only the dates", () => {
  const out = whoseClient(
    [booking("nadia", "2026-05-05"), booking("dave", "2026-01-05")],
    [],
  );
  assert.equal(out, "nadia");
});

// ------------------------------------ the appointment that did not happen

test("a cancelled appointment does not claim them", () => {
  /*
   * Somebody who cancelled with Nadia and then sat with Dave is Dave's. Taking
   * the cancelled one would put a client under the name of the person who
   * never actually saw them.
   */
  const out = whoseClient(
    [booking("dave", "2026-01-05"), booking("nadia", "2026-05-05", true)],
    [],
  );
  assert.equal(out, "dave");
});

test("only cancelled appointments falls back to who was asked for", () => {
  const out = whoseClient([booking("nadia", "2026-05-05", true)], [talk("dave")]);
  assert.equal(out, "dave");
});

// ------------------------------------------ most of the list, most of the time

test("somebody who has only enquired still belongs to whoever they asked for", () => {
  assert.equal(whoseClient([], [talk("sarah")]), "sarah");
});

test("an enquiry naming somebody counts even when the conversation does not", () => {
  // Arrived on the shop's widget, then asked for Sarah by name.
  assert.equal(whoseClient([], [talk(null, "sarah")]), "sarah");
});

test("the conversation wins over the enquiry on the same conversation", () => {
  // It arrived on Sarah's own link; the enquiry naming somebody else is the
  // customer wondering aloud, not where it came from.
  assert.equal(whoseClient([], [talk("sarah", "dave")]), "sarah");
});

test("an appointment always beats an enquiry", () => {
  assert.equal(whoseClient([booking("dave", "2026-03-01")], [talk("sarah")]), "dave");
});

test("the latest conversation is the one that counts", () => {
  assert.equal(whoseClient([], [talk("sarah"), talk("dave")]), "dave");
});
