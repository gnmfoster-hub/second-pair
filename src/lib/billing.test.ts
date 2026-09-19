import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billFor,
  textsLeft,
  costOfServing,
  marginOf,
  monthOf,
  monthBefore,
  monthName,
  costByChannel,
  addUpChannels,
  RATES,
  DEFAULT_PLAN,
  type Used,
} from "./billing.ts";

const quiet: Used = { textsOut: 142, textsIn: 40, emailsOut: 20, modelMicros: 2_510_000 };
const typical: Used = { textsOut: 527, textsIn: 160, emailsOut: 60, modelMicros: 10_050_000 };
const busy: Used = { textsOut: 1317, textsIn: 400, emailsOut: 150, modelMicros: 25_130_000 };

test("inside the bundle, the bill is just the plan", () => {
  const { lines, totalPence } = billFor(DEFAULT_PLAN, quiet);
  assert.equal(totalPence, 3900);
  assert.equal(lines.length, 1, "no extras line when there are no extras");
  assert.equal(textsLeft(DEFAULT_PLAN, quiet), 158);
});

test("past the bundle, the extras are a line of their own", () => {
  const { lines, totalPence } = billFor(DEFAULT_PLAN, typical);
  assert.equal(totalPence, 3900 + 227 * 8);
  assert.equal(lines[1].what, "Extra texts");
  assert.match(lines[1].detail, /227 past the bundle at 8p/);
  assert.equal(textsLeft(DEFAULT_PLAN, typical), 0);
});

/*
 * A customer texting the business costs us money and is never billed on.
 * Charging somebody for a message they received turns a renewal into an
 * argument.
 */
test("only texts we send count against the bundle", () => {
  const allInbound: Used = { textsOut: 0, textsIn: 900, emailsOut: 0, modelMicros: 0 };
  assert.equal(billFor(DEFAULT_PLAN, allInbound).totalPence, 3900);
});

test("an unlimited plan never adds an extras line", () => {
  const unlimited = { planPence: 9900, textsIncluded: null, overagePence: 0 };
  assert.equal(billFor(unlimited, busy).totalPence, 9900);
  assert.equal(textsLeft(unlimited, busy), null);
});

test("what a month costs us is the measured model plus what was sent", () => {
  // 251p model + 142 texts out at 4p + 40 in at 0.75p + 20 emails + £1 number
  assert.equal(costOfServing(quiet), Math.round(251 + 568 + 30 + 0.6 + 100));
});

test("every size makes money on the plan I would pick", () => {
  for (const used of [quiet, typical, busy]) {
    const bill = billFor(DEFAULT_PLAN, used);
    const margin = marginOf(bill.totalPence, costOfServing(used));
    assert.ok(margin.pence > 0, `${used.textsOut} texts loses money: ${margin.pence}p`);
    assert.ok(margin.percent >= 20, `${used.textsOut} texts is thin: ${margin.percent}%`);
  }
});

test("a business we are paying to keep shows as negative, not as zero", () => {
  const flat = { planPence: 2900, textsIncluded: null, overagePence: 0 };
  const margin = marginOf(billFor(flat, busy).totalPence, costOfServing(busy));
  assert.ok(margin.pence < 0);
  assert.ok(margin.percent < 0);
});

test("a month is the first of it, wherever the clock is", () => {
  assert.equal(monthOf(new Date("2026-09-16T23:30:00Z")), "2026-09-01");
  assert.equal(monthOf(new Date("2026-01-01T00:00:00Z")), "2026-01-01");
  assert.equal(monthBefore("2026-01-01"), "2025-12-01");
  assert.equal(monthBefore("2026-09-01"), "2026-08-01");
  assert.equal(monthName("2026-09-01"), "September 2026");
});

const channels = {
  sms: { out: 527, in: 160, windows: 140, micros: 6_000_000 },
  email: { out: 60, in: 70, windows: 40, micros: 2_000_000 },
  web: { out: 210, in: 190, windows: 96, micros: 8_000_000 },
  whatsapp: { out: 44, in: 51, windows: 22, micros: 1_500_000 },
};

test("each channel is costed the way it is actually charged", () => {
  const costs = costByChannel(channels);
  const of = (name: string) => costs.find((c) => c.channel === name)!;

  // Texts: per message, both ways.
  assert.equal(of("sms").carriagePence, 527 * 4 + 160 * 0.75);
  // Email: per message, and barely anything.
  assert.ok(of("email").carriagePence < 5);
  // The website carries nothing — its whole cost is the model.
  assert.equal(of("web").carriagePence, 0);
  assert.equal(of("web").pence, 800);
  // Meta is per conversation, not per message.
  assert.equal(of("whatsapp").windows, 22);
});

test("the dearest channel comes first, which is the point of the table", () => {
  const costs = costByChannel(channels);
  assert.equal(costs[0].channel, "sms");
  for (let i = 1; i < costs.length; i++) {
    assert.ok(costs[i - 1].pence >= costs[i].pence, "sorted by what it costs");
  }
});

/*
 * Nothing is live on Meta yet, so its rate is zero — and a zero that is really
 * "we do not know" has to say so, or a margin quietly looks better than it is.
 */
test("a channel with no rate yet says so rather than costing nothing", () => {
  const costs = costByChannel(channels);
  assert.equal(costs.find((c) => c.channel === "whatsapp")?.unpriced, true);
  assert.equal(costs.find((c) => c.channel === "sms")?.unpriced, false);

  const priced = costByChannel(channels, { ...RATES, metaConversationPence: 6 });
  const meta = priced.find((c) => c.channel === "whatsapp")!;
  assert.equal(meta.carriagePence, 22 * 6);
  assert.equal(meta.unpriced, false);
});

test("several businesses add up channel by channel", () => {
  const both = addUpChannels([channels, channels]);
  const sms = both.find((c) => c.channel === "sms")!;
  assert.equal(sms.out, 527 * 2);
  assert.equal(sms.carriagePence, (527 * 4 + 160 * 0.75) * 2);
});

test("a month with nothing on it is an empty table, not a crash", () => {
  assert.deepEqual(costByChannel(null), []);
  assert.deepEqual(addUpChannels([null, undefined]), []);
});

/*
 * The website add-on. No price is set anywhere in the product — it is a number
 * per business, because the price is not decided and an early product may well
 * want to charge three customers three different things while it finds out.
 */
test("a business without a website is billed exactly as before", () => {
  const before = billFor(DEFAULT_PLAN, quiet).totalPence;
  const after = billFor({ ...DEFAULT_PLAN, websitePence: 0 }, quiet).totalPence;
  assert.equal(after, before);
  assert.ok(!billFor({ ...DEFAULT_PLAN, websitePence: 0 }, quiet).lines.some((l) => l.what === "Website"));
});

test("a website is its own line, so it can be seen and stopped on its own", () => {
  const { lines, totalPence } = billFor({ ...DEFAULT_PLAN, websitePence: 1500 }, quiet);
  const line = lines.find((l) => l.what === "Website");
  assert.ok(line, `no website line in: ${lines.map((l) => l.what).join(", ")}`);
  assert.equal(line?.pence, 1500);
  assert.equal(totalPence, billFor(DEFAULT_PLAN, quiet).totalPence + 1500);
});

test("it is not folded into the plan, whatever else the month did", () => {
  const busy = billFor({ ...DEFAULT_PLAN, websitePence: 2000 }, typical);
  assert.equal(busy.lines.filter((l) => l.what === "Website").length, 1);
  assert.equal(busy.lines.find((l) => l.what === "Monthly plan")?.pence, DEFAULT_PLAN.planPence);
});
