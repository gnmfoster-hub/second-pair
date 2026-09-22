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
