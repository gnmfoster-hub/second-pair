import { test } from "node:test";
import assert from "node:assert/strict";
import { areaOf, whereTheWorkIs, howJobsRan, weekShapeLines } from "./reportShape.ts";

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

const money = (p: number) => `£${(p / 100).toFixed(0)}`;

test("the email says where the work was, once there is a pattern", () => {
  const lines = weekShapeLines({
    where: { areas: [{ area: "BS16", jobs: 2, pence: 64500 }, { area: "GL5", jobs: 1, pence: 48000 }] },
    running: { measured: 0, over: 0, under: 0, onTime: 0, typicalMinutes: 0 },
    service: "job",
    services: "jobs",
    money,
  });
  assert.deepEqual(lines, [
    "",
    "Where the work was:",
    "• BS16 — £645 across 2 jobs",
    "• GL5 — £480 across 1 job",
  ]);
});

test("one area on its own is not a pattern worth an email line", () => {
  const lines = weekShapeLines({
    where: { areas: [{ area: "BS16", jobs: 4, pence: 90000 }] },
    running: { measured: 0, over: 0, under: 0, onTime: 0, typicalMinutes: 0 },
    service: "job",
    services: "jobs",
    money,
  });
  assert.deepEqual(lines, []);
});

test("running over is worth saying; running to time is not", () => {
  const over = weekShapeLines({
    where: { areas: [] },
    running: { measured: 6, over: 4, under: 1, onTime: 1, typicalMinutes: 20 },
    service: "groom",
    services: "grooms",
    money,
  });
  assert.match(over.join("\n"), /Grooms ran about 20 minutes over, 4 of 6 of them/);

  const fine = weekShapeLines({
    where: { areas: [] },
    running: { measured: 9, over: 2, under: 2, onTime: 5, typicalMinutes: 3 },
    service: "job",
    services: "jobs",
    money,
  });
  assert.deepEqual(fine, []);
});

test("finishing early is said as an opportunity, not a fault", () => {
  const early = weekShapeLines({
    where: { areas: [] },
    running: { measured: 6, over: 1, under: 4, onTime: 1, typicalMinutes: -15 },
    service: "lesson",
    services: "lessons",
    money,
  });
  assert.match(early.join("\n"), /Lessons finished about 15 minutes early, 4 of 6 of them/);
  assert.match(early.join("\n"), /quote less time and win more of the work/);
});
