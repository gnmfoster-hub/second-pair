import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyBrief, type BriefBooking } from "./dailyBrief.ts";

const LONDON = "Europe/London";
const DAY = "2026-10-16T09:00:00Z";

function booking(over: Partial<BriefBooking> = {}): BriefBooking {
  return {
    starts_at: "2026-10-16T09:00:00Z",
    ends_at: "2026-10-16T10:00:00Z",
    all_day: false,
    title: "Group walk",
    notes: null,
    price_pence: 1400,
    category: "appointment",
    who: "Amber Hurden",
    client: "Julie Koch",
    phone: "07700 900123",
    deposit_amount_pence: 0,
    deposit_status: "paid",
    ...over,
  };
}

test("the day, in order, whatever order it arrived in", () => {
  const brief = dailyBrief(
    [
      booking({ starts_at: "2026-10-16T14:00:00Z", ends_at: "2026-10-16T15:00:00Z", title: "Afternoon" }),
      booking({ title: "Morning" }),
    ],
    { day: DAY, timeZone: LONDON, business: "Amber's Paws & Pastures" },
  );

  assert.ok(brief.text.indexOf("Morning") < brief.text.indexOf("Afternoon"));
  assert.match(brief.subject, /2 appointments/);
});

test("times are said the way a person says them, in the business's own time", () => {
  // 09:00Z in October is ten in the morning in London.
  const brief = dailyBrief([booking()], { day: DAY, timeZone: LONDON, business: "Amber's" });
  assert.match(brief.text, /10am to 11am/);
});

test("the number and the note, which are why somebody opens the appointment", () => {
  const brief = dailyBrief(
    [booking({ notes: "Gate code 4821.\nDog is nervous of bikes." })],
    { day: DAY, timeZone: LONDON, business: "Amber's" },
  );
  assert.match(brief.text, /07700 900123/);
  assert.match(brief.text, /Gate code 4821\. Dog is nervous of bikes\./);
});

test("whose it is, only where there is more than one of them", () => {
  const one = dailyBrief([booking()], { day: DAY, timeZone: LONDON, business: "Amber's" });
  assert.doesNotMatch(one.text, /with Amber Hurden/);

  const many = dailyBrief([booking()], {
    day: DAY,
    timeZone: LONDON,
    business: "The Salon",
    manyPeople: true,
  });
  assert.match(many.text, /with Amber Hurden/);
});

test("a quiet day is said out loud", () => {
  // No email and no appointments must not look the same as no email and a
  // job that has stopped running.
  const brief = dailyBrief([], { day: DAY, timeZone: LONDON, business: "Amber's" });
  assert.match(brief.subject, /nothing booked/);
  assert.match(brief.text, /Nothing in the diary for Friday 16 October/);
});

test("all-day things come first, because the day sits inside them", () => {
  const brief = dailyBrief(
    [booking({ title: "Nine o'clock" }), booking({ all_day: true, title: "Away", price_pence: null })],
    { day: DAY, timeZone: LONDON, business: "Amber's" },
  );
  assert.ok(brief.text.indexOf("All day  Away") < brief.text.indexOf("Nine o'clock"));
});

test("the total counts only what has a price, and says so when it is some of them", () => {
  const brief = dailyBrief(
    [booking({ price_pence: 1400 }), booking({ price_pence: null, title: "No price" })],
    { day: DAY, timeZone: LONDON, business: "Amber's" },
  );
  assert.match(brief.text, /£14 booked in, across 1 of the 2 with a price on them\./);
});

test("and says it plainly when everything is priced", () => {
  const brief = dailyBrief([booking({ price_pence: 1400 }), booking({ price_pence: 2600 })], {
    day: DAY,
    timeZone: LONDON,
    business: "Amber's",
  });
  assert.match(brief.text, /£40 booked in\./);
});

test("a deposit still owed is the one thing worth acting on before leaving", () => {
  const brief = dailyBrief(
    [booking({ deposit_amount_pence: 2000, deposit_status: "unpaid" })],
    { day: DAY, timeZone: LONDON, business: "Amber's" },
  );
  assert.match(brief.text, /deposit of £20 not paid/);
});

test("a deposit already paid is not mentioned at all", () => {
  const brief = dailyBrief(
    [booking({ deposit_amount_pence: 2000, deposit_status: "paid" })],
    { day: DAY, timeZone: LONDON, business: "Amber's" },
  );
  assert.doesNotMatch(brief.text, /deposit/);
});

test("it is addressed to whoever it is for", () => {
  const brief = dailyBrief([booking()], {
    day: DAY,
    timeZone: LONDON,
    business: "Amber's",
    forWhom: "Amber",
  });
  assert.match(brief.text, /Morning Amber\./);
});

test("the client's name is not said twice when it is also the title", () => {
  const brief = dailyBrief([booking({ title: "Julie Koch", client: "Julie Koch" })], {
    day: DAY,
    timeZone: LONDON,
    business: "Amber's",
  });
  assert.equal(brief.text.match(/Julie Koch/g)?.length, 1);
});

test("no long dashes anywhere in it", () => {
  // Nothing a customer or a client reads carries one.
  const brief = dailyBrief([booking({ notes: "Back gate" })], {
    day: DAY,
    timeZone: LONDON,
    business: "Amber's",
    forWhom: "Amber",
  });
  assert.doesNotMatch(brief.text + brief.subject, /[—–]/);
});
