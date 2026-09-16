import { test } from "node:test";
import assert from "node:assert/strict";
import { areaOf, whereTheWorkIs, howJobsRan } from "./reportShape.ts";

test("a postcode becomes the bit that means a place", () => {
  assert.equal(areaOf("BS7 9QT"), "BS7");
  assert.equal(areaOf("bs79qt"), "BS7");
  assert.equal(areaOf(" ba1 2pt "), "BA1");
  assert.equal(areaOf("EC1A 1BB"), "EC1A");
  assert.equal(areaOf("GL5"), "GL5");
});

test("anything that is not a postcode is left out rather than guessed", () => {
  for (const nonsense of ["", null, undefined, "round the corner", "opposite the pub", "12345"]) {
    assert.equal(areaOf(nonsense), null, String(nonsense));
  }
});

test("where the work is, by what it earned", () => {
  const { areas, unknown } = whereTheWorkIs([
    { postcode: "BS7 9QT", pence: 12000 },
    { postcode: "BS7 1AA", pence: 8000 },
    { postcode: "BA1 2PT", pence: 48000 },
    { postcode: "at the yard", pence: 5000 },
    { postcode: null, pence: 2000 },
  ]);

  assert.deepEqual(areas, [
    { area: "BA1", jobs: 1, pence: 48000 },
    { area: "BS7", jobs: 2, pence: 20000 },
  ]);
  assert.equal(unknown, 2);
});

test("only the top few areas, so a report stays readable", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ postcode: `B${i}1 1AA`, pence: (12 - i) * 1000 }));
  assert.equal(whereTheWorkIs(many).areas.length, 6);
  assert.equal(whereTheWorkIs(many, 3).areas[0].area, "B01");
});

test("nothing to say when nobody records a postcode", () => {
  const { areas, unknown } = whereTheWorkIs([{ pence: 100 }, { postcode: "", pence: 100 }]);
  assert.deepEqual(areas, []);
  assert.equal(unknown, 2);
});

test("how the jobs ran, in the middle rather than on average", () => {
  const ran = howJobsRan([
    { booked: 60, actual: 90 }, // half an hour over
    { booked: 60, actual: 75 },
    { booked: 60, actual: 60 },
    { booked: 120, actual: 100 },
    { booked: 60, actual: 300 }, // one disaster
  ]);

  assert.equal(ran.measured, 5);
  assert.equal(ran.over, 3);
  assert.equal(ran.under, 1);
  assert.equal(ran.onTime, 1);
  // The disaster does not drag the usual figure with it.
  assert.equal(ran.typicalMinutes, 15);
});

test("a job nobody timed says nothing at all", () => {
  const ran = howJobsRan([{ booked: 60 }, { actual: 60 }, { booked: 0, actual: 30 }]);
  assert.equal(ran.measured, 0);
  assert.equal(ran.typicalMinutes, 0);
});

test("five minutes either way is on time", () => {
  const ran = howJobsRan([
    { booked: 60, actual: 63 },
    { booked: 60, actual: 57 },
  ]);
  assert.equal(ran.onTime, 2);
  assert.equal(ran.over, 0);
});
