import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VERTICAL_LIST,
  VERTICALS,
  VERTICALS_BY_CATEGORY,
  DEFAULT_VERTICAL,
  verticalPack,
  searchTrades,
} from "./verticals.ts";

/**
 * What a business gets on the day it signs up.
 *
 * Everything here is seeded from the trade pack at onboarding and then edited.
 * A pack missing a piece is not a cosmetic problem: no bands means the
 * assistant cannot quote, and somebody has paid for a receptionist that
 * answers every price question with "let me check with the team".
 *
 * These run over all of them, because the failure only shows up when the first
 * customer in that trade signs up — which is exactly when nobody is watching.
 */

const names = (t: { id: string }) => t.id;

test("there are the trades we think there are", () => {
  assert.ok(VERTICAL_LIST.length >= 30, `only ${VERTICAL_LIST.length} trades`);
  assert.equal(VERTICAL_LIST.length, Object.keys(VERTICALS).length);
});

test("every id is unique", () => {
  const ids = VERTICAL_LIST.map(names);
  assert.equal(new Set(ids).size, ids.length, `duplicates: ${ids.filter((v, i) => ids.indexOf(v) !== i)}`);
});

test("the default trade exists", () => {
  assert.ok(VERTICALS[DEFAULT_VERTICAL], `no pack called ${DEFAULT_VERTICAL}`);
});

test("an unknown trade falls back rather than throwing", () => {
  assert.equal(verticalPack("not-a-real-trade").id, DEFAULT_VERTICAL);
  assert.equal(verticalPack(null).id, DEFAULT_VERTICAL);
  assert.equal(verticalPack(undefined).id, DEFAULT_VERTICAL);
});

// ------------------------------------------- what a new signup cannot do without

test("every trade can quote on day one", () => {
  // No bands means no prices, which means the assistant escalates every
  // pricing question — the single thing it is bought for.
  const broken = VERTICAL_LIST.filter((t) => !t.bands?.length).map(names);
  assert.deepEqual(broken, [], `no price bands: ${broken.join(", ")}`);
});

test("every band has a name and a sane length", () => {
  const broken: string[] = [];
  for (const trade of VERTICAL_LIST) {
    for (const b of trade.bands) {
      if (!b.size_label?.trim()) broken.push(`${trade.id}: unnamed band`);
      if (b.hours_low <= 0) broken.push(`${trade.id}/${b.size_label}: hours_low ${b.hours_low}`);
      if (b.hours_high < b.hours_low) broken.push(`${trade.id}/${b.size_label}: high < low`);
    }
  }
  assert.deepEqual(broken, []);
});

test("every trade reminds people about their appointment", () => {
  const broken = VERTICAL_LIST.filter((t) => !t.reminders?.length).map(names);
  assert.deepEqual(broken, [], `no reminder templates: ${broken.join(", ")}`);
});

test("reminders are worded, and land before the appointment", () => {
  const broken: string[] = [];
  for (const trade of VERTICAL_LIST) {
    for (const r of trade.reminders) {
      if (!r.body?.trim()) broken.push(`${trade.id}: empty reminder body`);
      if (!(r.hours_before > 0 && r.hours_before <= 720)) {
        broken.push(`${trade.id}: hours_before ${r.hours_before}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test("every trade opens with something to say", () => {
  const broken = VERTICAL_LIST.filter((t) => !t.greeting?.trim()).map(names);
  assert.deepEqual(broken, [], `no greeting: ${broken.join(", ")}`);
});

test("every trade knows what to call its people and its customers", () => {
  const broken: string[] = [];
  for (const t of VERTICAL_LIST) {
    for (const key of ["practitioner", "practitioners", "customer", "business", "service"] as const) {
      if (!t.vocabulary?.[key]?.trim()) broken.push(`${t.id}.${key}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("every trade asks at least one qualifying question", () => {
  const broken = VERTICAL_LIST.filter((t) => !t.qualification?.length).map(names);
  assert.deepEqual(broken, [], `nothing asked: ${broken.join(", ")}`);
});

test("qualifying questions are actually worded", () => {
  const broken: string[] = [];
  for (const t of VERTICAL_LIST) {
    for (const q of t.qualification) {
      if (!q.prompt?.trim()) broken.push(`${t.id}/${q.key}`);
    }
  }
  assert.deepEqual(broken, []);
});

// ------------------------------------------------------ settings that must be valid

test("deposits, location and pricing are values the app understands", () => {
  const broken: string[] = [];
  for (const t of VERTICAL_LIST) {
    if (!["required", "optional", "none"].includes(t.deposits)) broken.push(`${t.id}.deposits=${t.deposits}`);
    if (!["at_premises", "at_customer", "both"].includes(t.location)) broken.push(`${t.id}.location=${t.location}`);
    if (!["hourly", "fixed"].includes(t.pricing)) broken.push(`${t.id}.pricing=${t.pricing}`);
  }
  assert.deepEqual(broken, []);
});

test("service options carry both a value and a label", () => {
  const broken: string[] = [];
  for (const t of VERTICAL_LIST) {
    for (const o of [...(t.styles ?? []), ...(t.intents ?? [])]) {
      if (!o.value?.trim() || !o.label?.trim()) broken.push(`${t.id}: ${JSON.stringify(o)}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("no trade lists the same style twice", () => {
  const broken: string[] = [];
  for (const t of VERTICAL_LIST) {
    const vals = (t.styles ?? []).map((s) => s.value);
    if (new Set(vals).size !== vals.length) broken.push(t.id);
  }
  assert.deepEqual(broken, []);
});

// ------------------------------------------------------------- finding a trade

test("every trade appears in exactly one category", () => {
  const seen = VERTICALS_BY_CATEGORY.flatMap((c) => c.trades.map(names));
  assert.equal(seen.length, new Set(seen).size, "a trade is in two categories");
  assert.equal(seen.length, VERTICAL_LIST.length, "a trade is in no category");
});

test("searching finds a trade by its own name", () => {
  const found = searchTrades("tattoo").map(names);
  assert.ok(found.length, "nothing found for tattoo");
});

test("searching finds a trade by what people actually call it", () => {
  // The aliases exist so somebody typing "sparky" or "hairdresser" lands
  // somewhere, rather than concluding their trade is not supported.
  for (const term of ["sparky", "hairdresser", "dog groomer"]) {
    assert.ok(searchTrades(term).length, `nothing found for "${term}"`);
  }
});

test("searching for nonsense returns nothing rather than everything", () => {
  assert.equal(searchTrades("qzxwv").length, 0);
});
