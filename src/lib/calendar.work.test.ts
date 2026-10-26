import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, WORK_CATEGORIES } from "./calendar.ts";

/*
 * Work, or time held out of the diary.
 *
 * The diary used to decide this from `blocks`, which means "takes time up".
 * An appointment takes time up, so every appointment anybody typed in was
 * filed as a block: the value that means NOT WORK. 321 of them, worth
 * £7,140.50, counted on 26 October.
 *
 * Everything downstream filters blocks out and is right to, so the assistant
 * could not see a customer's appointment, the week's money ignored it, and no
 * review was ever asked for one. Alison texted Amber's about Alfie's midday
 * walk and was told there was nothing in the diary. There was.
 *
 * So the two ideas are tested apart, because they read alike and cost a
 * fortune when they are confused.
 */
test("the categories that are somebody's time with somebody", () => {
  assert.deepEqual([...WORK_CATEGORIES].sort(), ["appointment", "consultation", "meeting"]);
});

test("an appointment is work, and it also takes time up", () => {
  const appointment = CATEGORIES.find((c) => c.key === "appointment");
  assert.ok(appointment);
  assert.equal(WORK_CATEGORIES.includes("appointment"), true);
  /* Both true at once, which is the whole trap. */
  assert.equal(appointment.blocks, true);
});

test("a break takes time up and is not work", () => {
  const brk = CATEGORIES.find((c) => c.key === "break");
  assert.ok(brk);
  assert.equal(brk.blocks, true);
  assert.equal(WORK_CATEGORIES.includes("break"), false);
});

test("nothing that is plainly not work has crept onto the list", () => {
  const notWork = ["break", "holiday", "personal", "admin", "training", "supplies", "other"];
  for (const key of notWork) {
    assert.equal((WORK_CATEGORIES as string[]).includes(key), false, key);
  }
});

test("every name on the list is a real category", () => {
  const keys = CATEGORIES.map((c) => String(c.key));
  for (const key of WORK_CATEGORIES) assert.ok(keys.includes(String(key)), key);
});
