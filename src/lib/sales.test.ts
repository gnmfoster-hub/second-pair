import { test } from "node:test";
import assert from "node:assert/strict";
import { readSale, lineTotal, readMethod, penceOf, linesFromForm } from "./sales.ts";

const shampoo = { serviceId: "s1", name: "Shampoo, 250ml", quantity: 1, unitPence: 1450 };

test("one thing, sold", () => {
  const sale = readSale([shampoo]);
  assert.equal(sale.ok && sale.totalPence, 1450);
  assert.equal(sale.ok && sale.description, "Shampoo, 250ml");
});

test("several of a thing, and several things", () => {
  const sale = readSale([
    { ...shampoo, quantity: 2 },
    { serviceId: "s2", name: "Conditioner", quantity: 1, unitPence: 1300 },
  ]);
  assert.equal(sale.ok && sale.totalPence, 1450 * 2 + 1300);
  assert.equal(sale.ok && sale.description, "2 × Shampoo, 250ml, Conditioner");
});

/*
 * Money is integer pence everywhere in this product. A till that is a penny
 * out at the end of a week is a till nobody trusts.
 */
test("a long sale adds up exactly", () => {
  const lines = Array.from({ length: 20 }, (_, i) => ({
    serviceId: null,
    name: `Thing ${i}`,
    quantity: 3,
    unitPence: 1010,
  }));
  const sale = readSale(lines);
  assert.equal(sale.ok && sale.totalPence, 20 * 3 * 1010);
});

test("something typed in on the spot is still a sale", () => {
  const sale = readSale([{ serviceId: null, name: "Gift voucher", quantity: 1, unitPence: 5000 }]);
  assert.equal(sale.ok && sale.totalPence, 5000);
  assert.equal(sale.ok && sale.lines[0].serviceId, null);
});

test("free is a real price, and nothing is not", () => {
  assert.equal(readSale([{ ...shampoo, unitPence: 0 }]).ok, true);
  const none = readSale([{ serviceId: null, name: "Mystery", quantity: 1 }]);
  assert.equal(none.ok, false);
  assert.match(none.ok === false ? none.because : "", /needs a price/);
});

test("a line somebody added and changed their mind about is not an error", () => {
  const sale = readSale([shampoo, { serviceId: null, name: "", quantity: 1 }]);
  assert.equal(sale.ok && sale.lines.length, 1);
});

test("an empty sale is refused rather than recorded as nothing", () => {
  const sale = readSale([]);
  assert.equal(sale.ok, false);
  assert.match(sale.ok === false ? sale.because : "", /Nothing has been added/);
});

test("none of a thing is not a sale", () => {
  const sale = readSale([{ ...shampoo, quantity: 0 }]);
  assert.equal(sale.ok, false);
  assert.match(sale.ok === false ? sale.because : "", /How many/);
});

test("half a bottle is not a quantity", () => {
  assert.equal(readSale([{ ...shampoo, quantity: 1.5 }]).ok, false);
});

test("a price that is not money is refused, not rounded", () => {
  assert.equal(readSale([{ ...shampoo, unitPence: 14.5 }]).ok, false);
  assert.equal(readSale([{ ...shampoo, unitPence: -100 }]).ok, false);
});

test("one line's total", () => {
  assert.equal(lineTotal({ quantity: 3, unitPence: 999 }), 2997);
});

test("a method nobody offered is recorded as something else, not as itself", () => {
  assert.equal(readMethod("cash"), "cash");
  assert.equal(readMethod("bitcoin"), "other");
  assert.equal(readMethod(""), "other");
});

// ─────────────────────────────────────────────── what a form says a sale is

test("penceOf takes what somebody actually types", () => {
  assert.equal(penceOf("12"), 1200);
  assert.equal(penceOf("12.50"), 1250);
  assert.equal(penceOf("£12.50"), 1250);
  assert.equal(penceOf("1,250"), 125000);
  assert.equal(penceOf(" 8 "), 800);
});

test("and a blank is not nothing — it is nobody having said", () => {
  assert.ok(Number.isNaN(penceOf("")));
  assert.ok(Number.isNaN(penceOf("what")));
});

test("linesFromForm reads the rows that were filled in", () => {
  const form: Record<string, string> = {
    name_0: "Shampoo",
    qty_0: "2",
    price_0: "14.50",
    service_0: "svc-1",
    name_2: "Conditioner",
    price_2: "14.50",
  };
  const lines = linesFromForm((k) => form[k] ?? null);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    serviceId: "svc-1",
    name: "Shampoo",
    quantity: 2,
    unitPence: 1450,
  });
  // A row with no quantity is one of them, which is what a till assumes.
  assert.equal(lines[1]?.quantity, 1);
  assert.equal(lines[1]?.serviceId, null);
});

test("a row nobody touched is not a line", () => {
  assert.equal(linesFromForm(() => null).length, 0);
  assert.equal(linesFromForm((k) => (k === "qty_0" ? "1" : null)).length, 0);
});

/*
 * The gap matters: a form can leave row 1 empty and fill row 2, and reading
 * only up to the first blank would lose the second.
 */
test("a gap in the middle does not stop it", () => {
  const form: Record<string, string> = { name_0: "A", price_0: "1", name_5: "B", price_5: "2" };
  assert.equal(linesFromForm((k) => form[k] ?? null).length, 2);
});
