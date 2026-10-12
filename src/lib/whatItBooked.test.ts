import { test } from "node:test";
import assert from "node:assert/strict";
import { whatItBooked } from "./whatItBooked.ts";

const live = (price: number | null = null) => ({ cancelled_at: null, price_pence: price });
const gone = (price: number | null = null) => ({
  cancelled_at: "2026-10-01T00:00:00Z",
  price_pence: price,
});

// ------------------------------------------------------------- the count

test("two appointments off one enquiry count as two", () => {
  /*
   * The fault Giles found. Both the inbox row and the weekly report counted
   * the conversation, so a consultation and the work booked in one chat read
   * as a single booking beside a diary showing two.
   */
  assert.equal(whatItBooked([live(6000), live(16000)], 16000).count, 2);
});

test("a cancelled one is not counted or charged for", () => {
  const out = whatItBooked([live(6000), gone(30000)], null);
  assert.equal(out.count, 1);
  assert.equal(out.pence, 6000);
});

test("an enquiry that booked nothing is nought, not a quote", () => {
  // Quoted and never booked must never read as money won.
  assert.deepEqual(whatItBooked([], 25000), { count: 0, pence: 0 });
  assert.deepEqual(whatItBooked(null, 25000), { count: 0, pence: 0 });
});

// ------------------------------------------------------------- the money

test("the agreed price wins over the quote", () => {
  // Quoted 160, agreed 210. The report used to insist on 160 for ever.
  assert.equal(whatItBooked([live(21000)], 16000).pence, 21000);
});

test("the quote carries a booking nobody priced", () => {
  /*
   * Most bookings never get a price typed on them. Falling straight to nought
   * is how a business comes to disbelieve the figure.
   */
  assert.equal(whatItBooked([live(null)], 16000).pence, 16000);
});

test("two bookings off one quote are counted twice, not once", () => {
  // A standing weekly job priced per visit is worth its price per visit.
  assert.equal(whatItBooked([live(null), live(null)], 1200).pence, 2400);
});

test("no price and no quote is nought rather than a guess", () => {
  assert.equal(whatItBooked([live(null)], null).pence, 0);
});

test("a price of zero is honoured, not treated as missing", () => {
  /*
   * Nought is a real answer: a touch-up done free, or the owner's own time
   * typed in. Reading it as "unset" and falling back to the quote would
   * invent money that was never charged.
   */
  assert.equal(whatItBooked([live(0)], 16000).pence, 0);
});

// --------------------------------------------------------- the real case

test("Living Canvas, as it actually stood on 12 October", () => {
  /*
   * Two assistant bookings, both quoted £160. One was taken before the price
   * was ever written onto a booking, so it only has the quote; the other
   * carries its own. The old rule read the quote twice and said £320.
   */
  const lauren = whatItBooked([live(null)], 16000);
  const marika = whatItBooked([live(16000)], 16000);
  assert.equal(lauren.pence + marika.pence, 32000);
  assert.equal(lauren.count + marika.count, 2);
});
