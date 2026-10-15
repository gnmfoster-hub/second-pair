import { test } from "node:test";
import assert from "node:assert/strict";
import { planReminders } from "./reminderSchedule.ts";

/* A fixed evening, so "in three days" means the same thing every run. */
const NOW = Date.parse("2026-09-22T19:00:00.000Z");
const hours = (n: number) => new Date(NOW + n * 3600_000).toISOString();

const t = (id: string, hours_before: number) => ({ id, hours_before });

test("a confirmation is due now, not at the appointment", () => {
  const plan = planReminders([t("c", 0)], hours(72), NOW);

  assert.equal(plan.confirmations.length, 1);
  assert.equal(plan.timed.length, 0);
  /*
   * The whole point. The ordinary arithmetic on a zero gives the appointment
   * time, which is the one moment a confirmation is no use to anybody.
   */
  assert.equal(plan.confirmations[0].due_at, new Date(NOW).toISOString());
  assert.equal(plan.confirmations[0].confirmation, true);
});

test("a timed reminder is due that many hours before the appointment", () => {
  const plan = planReminders([t("day", 24)], hours(72), NOW);

  assert.equal(plan.timed.length, 1);
  assert.equal(plan.timed[0].due_at, hours(48));
  assert.equal(plan.timed[0].confirmation, false);
});

test("a reminder whose moment has already passed is not scheduled", () => {
  /* Booked for two hours' time, with a reminder set for the day before. */
  const plan = planReminders([t("day", 24)], hours(2), NOW);

  assert.deepEqual(plan.timed, []);
});

/*
 * The one that would be easiest to get wrong and hardest to notice.
 *
 * The rule that drops reminders whose moment has passed asks for a due time
 * strictly in the future, and a confirmation's is now — which is not. Written
 * carelessly, the filter eats every confirmation, and the feature simply never
 * works while looking entirely correct in the settings screen.
 */
test("the past-reminder rule does not eat the confirmation", () => {
  const plan = planReminders([t("c", 0), t("day", 24)], hours(2), NOW);

  assert.equal(plan.confirmations.length, 1, "the confirmation must survive");
  assert.deepEqual(plan.timed, [], "the day-before one is already too late");
});

test("a confirmation and its reminders are kept apart", () => {
  const plan = planReminders([t("c", 0), t("two", 48), t("day", 24)], hours(72), NOW);

  assert.deepEqual(plan.confirmations.map((r) => r.template_id), ["c"]);
  assert.deepEqual(plan.timed.map((r) => r.template_id), ["two", "day"]);
});

test("a business with no confirmation gets none", () => {
  const plan = planReminders([t("day", 24)], hours(72), NOW);

  assert.deepEqual(plan.confirmations, []);
  assert.equal(plan.timed.length, 1);
});

test("no templates is no reminders rather than an error", () => {
  assert.deepEqual(planReminders([], hours(72), NOW), { confirmations: [], timed: [] });
});

/*
 * A reminder set for exactly now is not in the future, so it is dropped. Said
 * out loud because the boundary is the thing a rewrite gets wrong, and off by
 * one here means a reminder fires the instant somebody books.
 */
test("a reminder due exactly now is too late", () => {
  const plan = planReminders([t("day", 24)], hours(24), NOW);

  assert.deepEqual(plan.timed, []);
});

test("an unreadable appointment time drops the timed ones and keeps the confirmation", () => {
  const plan = planReminders([t("c", 0), t("day", 24)], "not a date", NOW);

  assert.equal(plan.confirmations.length, 1);
  assert.deepEqual(plan.timed, []);
});

// -------------------------------------------- sent at a sensible hour

const TZ = "Europe/London";
const at = (iso: string) => Date.parse(iso);
const whenSent = (startsAt: string, hoursBefore: number) =>
  planReminders([{ id: "t", hours_before: hoursBefore }], startsAt, at("2026-01-01T00:00:00Z"), TZ)
    .timed[0]?.due_at;

const londonHour = (iso: string) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false })
    .format(new Date(iso)));

test("an early appointment does not text somebody before eight", () => {
  /*
   * Amber walks dogs at seven. The day-before reminder landed at seven in the
   * morning, because due_at was nothing but the appointment minus the hours.
   */
  const sent = whenSent("2026-06-10T07:00:00+01:00", 24);
  assert.equal(londonHour(sent), 8, sent);
});

test("a reminder that would land late in the evening is moved back, not forward", () => {
  /*
   * Forward would be the next morning, which can be after the appointment.
   * A reminder arriving afterwards is worse than one arriving early.
   */
  const sent = whenSent("2026-06-10T09:00:00+01:00", 12);
  assert.equal(londonHour(sent), 20, sent);
  assert.ok(Date.parse(sent) < at("2026-06-10T09:00:00+01:00"));
});

test("a sensible hour is left exactly alone", () => {
  const sent = whenSent("2026-06-10T10:00:00+01:00", 24);
  assert.equal(sent, new Date(at("2026-06-09T10:00:00+01:00")).toISOString());
});

test("nudging never pushes a reminder past its own appointment", () => {
  // Two hours before a seven o'clock start: moving to eight would be too late.
  const sent = whenSent("2026-06-10T07:00:00+01:00", 2);
  assert.ok(Date.parse(sent) < at("2026-06-10T07:00:00+01:00"), sent);
  assert.equal(londonHour(sent), 5, sent);
});

test("a confirmation is still due now, not nudged anywhere", () => {
  const plan = planReminders(
    [{ id: "c", hours_before: 0 }],
    "2026-06-10T07:00:00+01:00",
    at("2026-06-09T23:30:00Z"),
    TZ,
  );
  assert.equal(plan.confirmations.length, 1);
  assert.equal(plan.confirmations[0].due_at, new Date(at("2026-06-09T23:30:00Z")).toISOString());
});
