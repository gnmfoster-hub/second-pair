import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFromService, bandsFromServices, minutesForClient } from "./serviceBands.ts";
import { quoteForBand } from "./quote.ts";
import type { Artist, Service } from "./types.ts";

const service = (over: Partial<Service> = {}): Service => ({
  id: "svc-1",
  studio_id: "shop",
  name: "Cut and blow dry",
  kind: "service",
  minutes: 45,
  price_pence: 3000,
  price_to_pence: null,
  requires_consultation: false,
  bookable_online: true,
  active: true,
  sort_order: 0,
  artist_id: null,
  ...over,
});

test("a service becomes a flat-price band the engine already understands", () => {
  const b = bandFromService(service());
  assert.equal(b.id, "svc-1");
  assert.equal(b.size_label, "Cut and blow dry");
  assert.equal(b.price_low_pence, 3000);
  assert.equal(b.duration_minutes, 45);
});

/*
 * The point of the whole adapter: whatever the engine does with a band, it
 * must arrive at the salon's own price rather than at an hourly rate. An
 * artist on £90/hr with a £60 minimum must still quote £30 for a £30 cut.
 */
test("quoting it ignores the hourly rate and the minimum charge", () => {
  const expensive = { hourly_rate_pence: 9000, min_charge_pence: 6000 } as Artist;
  const q = quoteForBand(expensive, bandFromService(service()));
  assert.equal(q.low_pence, 3000);
  assert.equal(q.high_pence, 3000);
  assert.equal(q.hit_minimum, false);
});

test("a range on the list survives into the quote", () => {
  const b = bandFromService(service({ price_pence: 12000, price_to_pence: 16000 }));
  const q = quoteForBand({ hourly_rate_pence: 9000, min_charge_pence: 0 } as Artist, b);
  assert.equal(q.low_pence, 12000);
  assert.equal(q.high_pence, 16000);
});

test("this person's own price is what is quoted for them", () => {
  const b = bandFromService(service(), { minutes: 40, price_pence: 4500 });
  assert.equal(b.price_low_pence, 4500);
  assert.equal(b.duration_minutes, 40);
});

/* Each of these is a distinct way of embarrassing a business. */
test("a product is not something anybody can be booked in for", () => {
  assert.equal(bandsFromServices([service({ kind: "product", minutes: null })]).length, 0);
});

test("something not offered online is kept off what the assistant may suggest", () => {
  assert.equal(bandsFromServices([service({ bookable_online: false })]).length, 0);
});

test("something retired is not offered", () => {
  assert.equal(bandsFromServices([service({ active: false })]).length, 0);
});

/*
 * The worst thing the assistant could do is invent a number. A service with no
 * price is left out entirely rather than quoted at a guess.
 */
test("a service with no price is never offered", () => {
  assert.equal(bandsFromServices([service({ price_pence: null })]).length, 0);
});

test("a service with no length is never offered, because it cannot be booked", () => {
  assert.equal(bandsFromServices([service({ minutes: null })]).length, 0);
});

test("consultation-first survives, so it is still booked as a consultation", () => {
  const [b] = bandsFromServices([service({ requires_consultation: true })]);
  assert.equal(b.requires_consultation, true);
});

test("the list keeps the order the business put it in", () => {
  const bands = bandsFromServices([
    service({ id: "b", name: "Colour", sort_order: 2 }),
    service({ id: "a", name: "Cut", sort_order: 1 }),
  ]);
  assert.deepEqual(bands.map((b) => b.size_label), ["Cut", "Colour"]);
});

// ------------------------------------------------------- this client, longer

test("a client who needs longer gets longer", () => {
  assert.equal(minutesForClient(45, 20, 480), 65);
});

test("a client who is quicker gets less", () => {
  assert.equal(minutesForClient(45, -15, 480), 30);
});

test("nothing known about them is the book's own length", () => {
  assert.equal(minutesForClient(45, null, 480), 45);
});

/*
 * A delta big enough to cancel the appointment out is a typo from months ago,
 * and an appointment of no length is not the right answer to it.
 */
test("it never produces an appointment of no length", () => {
  assert.equal(minutesForClient(30, -200, 480), 5);
});

test("it never runs past what the business allows in one sitting", () => {
  assert.equal(minutesForClient(300, 300, 480), 480);
});
