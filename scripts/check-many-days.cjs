/*
 * Booking one thing on several days, in a real browser, checked in the database.
 *
 *   node scripts/check-many-days.cjs
 *
 * Giles asked for this on 28 September for a pet-care business: a run of cat
 * visits while somebody is away. It is the first feature here that writes
 * several rows from one press of one button, which makes it the first one where
 * "the screen said it worked" is a long way from "it worked".
 *
 * ── Why it drives a browser rather than posting the form ────────────────────
 *
 * Because check-forms.cjs already learnt this the hard way: posting fields at a
 * route gave three green ticks for a request that had submitted nothing, since a
 * server action is not a form post. The whole value of this check is that it
 * presses the real button on the real page.
 *
 * ── What it actually asserts ────────────────────────────────────────────────
 *
 * Rows. Not the wording, not a toast, not the absence of an error. The three
 * things that would each be a silent failure:
 *
 *   1. Every day picked became an appointment, on the day picked. A day quietly
 *      missing is the whole fault this feature exists to prevent — somebody
 *      pays for four visits and the cat is fed three times.
 *   2. They are joined by repeat_parent_id, because that is the only record
 *      that they are one job. "dates" is never written to the repeats column
 *      (it is a Postgres enum and does not have it) so the parent link is all
 *      there is.
 *   3. The times are what was asked for: the one day given a time of its own is
 *      at that time, and every day left alone is at the booking's. Read in the
 *      business's own zone, because adding days in milliseconds is how a Tuesday
 *      five o'clock visit becomes four o'clock in November.
 *
 * Then a second scenario, for the other half of the same feature: a run booked
 * for one client sends ONE confirmation describing the whole thing, not one per
 * day. Somebody who books once being told six times they are booked in does not
 * read as thoroughness, it reads as six appointments.
 *
 * Runs on a demo, and takes its own rows out afterwards whether it passed or
 * failed. It must never be pointed at a real business: it writes appointments.
 */
require("./pw/look.cjs"); // for the credentials, from .env.local
const { chromium } = require("playwright-core");
const { signIn, SITE } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");
const { randomBytes } = require("node:crypto");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/*
 * Pawfect, because it is the demo whose trade actually does this, and because a
 * demo is the only place this may run at all. Anything not ending -demo is
 * refused below.
 */
const SLUG = "pawfect-demo";

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};

/** A plain YYYY-MM-DD this many days from today. */
const dayFromNow = (n) => {
  const at = new Date();
  at.setDate(at.getDate() + n);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
};

(async () => {
  if (!/-demo$/.test(SLUG)) {
    console.error("This writes appointments. Demos only.");
    process.exit(1);
  }

  const { data: studio, error: se } = await db
    .from("studios")
    .select("id, name, timezone")
    .eq("slug", SLUG)
    .single();
  if (se || !studio) {
    console.error(`Could not read ${SLUG}: ${se?.message ?? "no such business"}`);
    process.exit(1);
  }

  const { data: people } = await db
    .from("artists")
    .select("id, user_id, name")
    .eq("studio_id", studio.id)
    .not("user_id", "is", null)
    .limit(1);
  const owner = people?.[0];
  if (!owner) {
    console.error(`${SLUG} has nobody who can sign in.`);
    process.exit(1);
  }

  /*
   * A title nothing else could have written, so the rows can be found again and
   * removed without any chance of touching a seeded booking.
   */
  const tag = `zz-check-${randomBytes(4).toString("hex")}`;

  /* Far enough out that the demo's seeded week cannot clash with any of them. */
  const first = dayFromNow(40);
  const picked = [dayFromNow(41), dayFromNow(43), dayFromNow(46)];
  const wanted = [first, ...picked];

  /* One day given a time of its own; the rest inherit the booking's. */
  const ODD_DAY = picked[1];
  const ODD_TIME = "14:30";
  const USUAL_TIME = "09:00";

  console.log(`\nBooking "${tag}" on ${wanted.length} days at ${studio.name}`);
  console.log(`  ${wanted.join("  ")}\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });

  try {
    const page = await signIn(context, owner.user_id, "/diary");
    if (page.url().includes("/login")) {
      bad("could not sign in", "the magic link bounced to /login");
      throw new Error("no session");
    }

    /*
     * Add → "Time off, or something that is not a client".
     *
     * That branch is chosen because it takes a free-text title, which is what
     * lets this check tag its own rows and find them again. The repeat control
     * is the same on every branch of that menu.
     *
     * Matched on the menu's own words rather than on a guess at them: the first
     * version of this looked for "Something else" and waited thirty seconds for
     * a button that has never existed.
     */
    await page.getByRole("button", { name: /^Add something/ }).click();
    await page
      .getByRole("button", { name: /Time off, or something that is not a client/i })
      .first()
      .click();

    const sheet = page.locator("form").filter({ has: page.locator('input[name="date"]') }).first();
    await sheet.locator('input[name="date"]').fill(first);
    await sheet.locator('input[name="start_time"]').fill(USUAL_TIME);

    /*
     * The title field is named differently depending on what the add menu said,
     * so whichever of the two is actually on the page gets it.
     */
    const title = sheet.locator('input[name="title"], input[name="contact_name"]').first();
    await title.fill(tag);

    /* The control this whole check is about. */
    await sheet.locator('select[name="repeats"]').selectOption("dates");

    /*
     * Each day, and a different time on the middle one.
     *
     * Giles, 29 Sep: "give the ability to adjust time on each but default to
     * original." Both halves of that are worth proving, so one row is given its
     * own time and the others are left alone - and the rows left alone have to
     * come out at the booking's time, not blank and not midnight.
     */
    for (const [i, day] of picked.entries()) {
      await sheet.getByRole("button", { name: /Add another day/i }).click();
      await sheet.locator('input[type="date"]').nth(i + 1).fill(day);
      if (day === ODD_DAY) {
        await sheet.locator('input[type="time"]').nth(i + 1).fill(ODD_TIME);
      }
    }

    /*
     * The count on the screen, before pressing anything.
     *
     * It is the number somebody checks before filling a week of their diary, so
     * a wrong one is worse than none at all. Asserted against the same figure
     * the rows are then counted against.
     */
    const counted = await sheet.getByText(/That makes \d+ visits/).first().textContent();
    const said = Number(/(\d+)/.exec(counted ?? "")?.[1] ?? 0);
    if (said === wanted.length) ok(`the screen says ${said} visits before saving`);
    else bad(`the screen says ${said} visits`, `it is about to write ${wanted.length}`);

    /*
     * "Add it", exactly.
     *
     * The first version of this matched /^(Add|Save)/ and took the first hit,
     * which is "Add another day" — a button that is right there in the same
     * form and does something perfectly sensible. So the run pressed the day
     * picker again, saved nothing, and reported "nothing was written at all",
     * which reads like a broken feature rather than a broken selector. That is
     * the third time this month a check has accused the product of its own
     * mistake, so: the exact label, anchored.
     */
    await sheet.getByRole("button", { name: /^Add it$/ }).click();
    await page.waitForTimeout(4000);

    /*
     * Whatever the form itself said, before going anywhere near the database.
     *
     * Without this, every possible failure arrives as "nothing was written",
     * and a refused save with a perfectly clear message on screen is
     * indistinguishable from a button that does nothing.
     */
    const complaint = await sheet
      .locator("p.text-bad, p.text-warn")
      .first()
      .textContent()
      .catch(() => null);
    if (complaint?.trim()) bad("the form refused it", complaint.trim());

    // ---------------------------------------------------------------- the rows
    const { data: rows, error: re } = await db
      .from("bookings")
      .select("id, starts_at, ends_at, title, repeats, repeat_parent_id, cancelled_at")
      .eq("title", tag)
      .order("starts_at");

    if (re) {
      bad("could not read the bookings back", re.message);
    } else if (!rows?.length) {
      bad("nothing was written at all", "the press did nothing, or the title did not save");
    } else {
      const live = rows.filter((r) => !r.cancelled_at);

      /* 1 — every day, and the right days. */
      const landed = live.map((r) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: studio.timezone, dateStyle: "short" })
          .format(new Date(r.starts_at))
          .replaceAll("/", "-"),
      );
      const missing = wanted.filter((d) => !landed.includes(d));
      const extra = landed.filter((d) => !wanted.includes(d));

      if (live.length === wanted.length && !missing.length && !extra.length) {
        ok(`${live.length} appointments, on exactly the days picked`);
      } else {
        bad(
          `${live.length} appointments for ${wanted.length} days picked`,
          `missing ${missing.join(", ") || "none"}; unexpected ${extra.join(", ") || "none"}`,
        );
      }

      /* 2 — held together, because nothing else records that they are one job. */
      const parents = new Set(live.map((r) => r.repeat_parent_id).filter(Boolean));
      const firsts = live.filter((r) => !r.repeat_parent_id);
      if (parents.size === 1 && firsts.length === 1 && parents.has(firsts[0].id)) {
        ok("all of them point at the first one, so the set can be found again");
      } else {
        bad(
          "they are not joined up",
          `${firsts.length} without a parent, ${parents.size} distinct parents`,
        );
      }

      /*
       * 3 - the times, which are no longer all the same on purpose.
       *
       * One day was given 14:30 and the rest were left alone. So the check is
       * that the one asked for is at 14:30 and every other is at the booking's
       * own 09:00 - which is both halves of "adjust time on each, default to
       * original" in one assertion. Read in the business's own zone, because
       * adding days in milliseconds is how a Tuesday five o'clock becomes four
       * o'clock in November.
       */
      const clock = (iso) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: studio.timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(iso));

      const dayOf = (iso) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: studio.timezone, dateStyle: "short" })
          .format(new Date(iso))
          .replaceAll("/", "-");

      const odd = live.find((r) => dayOf(r.starts_at) === ODD_DAY);
      const rest = live.filter((r) => dayOf(r.starts_at) !== ODD_DAY);

      if (odd && clock(odd.starts_at) === ODD_TIME) {
        ok(`the day given its own time is at ${ODD_TIME}`);
      } else {
        bad(`the day given ${ODD_TIME} is at ${odd ? clock(odd.starts_at) : "no time at all"}`);
      }

      const others = new Set(rest.map((r) => clock(r.starts_at)));
      if (others.size === 1 && others.has(USUAL_TIME)) {
        ok(`the ${rest.length} left alone are all at ${USUAL_TIME}, the booking's own`);
      } else {
        bad("the days left alone did not inherit the booking's time", [...others].join(", "));
      }

      /* And the value that would have been refused by the enum. */
      const stored = new Set(live.map((r) => r.repeats));
      if (stored.size === 1 && stored.has("none")) {
        ok('stored as "none", which the repeats enum accepts');
      } else {
        bad("unexpected value in the repeats column", [...stored].join(", "));
      }
    }

    // ------------------------------------------------------------- tidying up
    const { error: de } = await db.from("bookings").delete().eq("title", tag);
    if (de) bad("could not remove the check's own bookings", `${de.message} — title ${tag}`);
    else ok("the check's own bookings taken back out");
  } catch (e) {
    bad("the run did not finish", e.message);
    /* Deleted here too: a half-finished run must not leave visits in a diary. */
    await db.from("bookings").delete().eq("title", tag);
  } finally {
    await browser.close();
  }

  // ══════════════════════════════════ and one confirmation for the whole run
  /*
   * Giles, 29 Sep: "if a booking is made with multiple repeated days summarise
   * this in the confirmation, don't send one for each day."
   *
   * The first half of that is the half with the consequence. A run booked in one
   * press used to write one confirmation per day, so somebody who booked once
   * was told six times they were booked in - which does not read as
   * thoroughness, it reads as six appointments.
   *
   * This is its own scenario rather than part of the one above, because it needs
   * three things the first does not: a client to send to, a category that
   * schedules reminders at all, and a confirmation wording to render. All three
   * are made here and taken back out afterwards.
   */
  await confirmsOnce();

  await changesTheRest();

  async function confirmsOnce() {
    const runTag = `zz-conf-${randomBytes(4).toString("hex")}`;
    const days = [dayFromNow(60), dayFromNow(61), dayFromNow(62)];
    let madeTemplate = null;

    console.log(`
  A run of ${days.length} for one client, and what they get told
`);

    const browser2 = await chromium.launch({ channel: "chrome", headless: true });
    const context2 = await browser2.newContext({ viewport: { width: 1280, height: 1000 } });

    try {
      /*
       * A confirmation to render. Pawfect has none, which is itself a finding
       * that check-confirmation reports - three of four real businesses are in
       * the same state. Made here so this can check what it is here to check.
       */
      const { data: made, error: te } = await db
        .from("reminder_templates")
        .insert({
          studio_id: studio.id,
          label: runTag,
          hours_before: 0,
          body: "That's booked in, {{name}}: {{when}}.",
          enabled: true,
          sort_order: 98,
        })
        .select("id")
        .single();
      if (te) throw new Error(`could not add a confirmation: ${te.message}`);
      madeTemplate = made.id;

      const page = await signIn(context2, owner.user_id, "/diary");
      await page.getByRole("button", { name: /^Add something/ }).click();
      await page.getByRole("button", { name: /Somebody new, or a walk-in/i }).first().click();

      const sheet = page.locator("form").filter({ has: page.locator('input[name="date"]') }).first();

      /*
       * A client with an email address, made first and then picked.
       *
       * Both halves are deliberate. The picker has one box with no name
       * attribute, and typing into it is not enough - a name only becomes a
       * client when the button that appears underneath is pressed, which an
       * earlier check spent two runs failing to notice.
       *
       * And the address is the reason this is made in the database rather than
       * typed as a walk-in. The first version added a bare name, and the
       * confirmation came out with no words in it - correctly: there is nowhere
       * to send a message to somebody with no phone and no email, so the row
       * stays pending and is never rendered. That is right behaviour and it
       * proves nothing about the wording, which is what this is here for.
       */
      const { data: person, error: pe } = await db
        .from("contacts")
        .insert({
          studio_id: studio.id,
          name: `${runTag} Barker`,
          email: `${runTag}@example.invalid`,
        })
        .select("id")
        .single();
      if (pe) throw new Error(`could not add a client: ${pe.message}`);

      await sheet
        .locator('input:not([name]):not([type=checkbox]):not([type=hidden])')
        .nth(0)
        .fill(`${runTag} Barker`);
      await page.waitForTimeout(1200);
      /*
       * The existing one, not "add as a new client" - which would make a second
       * with the same name and no address, and put us back where we started.
       */
      await sheet
        .getByRole("button", { name: new RegExp(`${runTag} Barker`) })
        .filter({ hasNotText: /as a new client/i })
        .first()
        .click();
      await page.waitForTimeout(600);
      void person;

      await sheet.locator('input[name="date"]').fill(days[0]);
      await sheet.locator('input[name="start_time"]').fill("09:00");
      await sheet.locator('select[name="repeats"]').selectOption("dates");

      for (const [i, day] of days.slice(1).entries()) {
        await sheet.getByRole("button", { name: /Add another day/i }).click();
        await sheet.locator('input[type="date"]').nth(i + 1).fill(day);
      }

      await sheet.getByRole("button", { name: /^Add it$/ }).click();
      await page.waitForTimeout(6000);

      const { data: booked } = await db
        .from("bookings")
        .select("id, starts_at, repeat_parent_id")
        .ilike("title", `%${runTag}%`);

      if ((booked ?? []).length !== days.length) {
        bad(`${(booked ?? []).length} of ${days.length} visits went in`, "cannot check the rest");
        return;
      }
      ok(`${booked.length} visits booked for one client`);

      const ids = booked.map((b) => b.id);
      const { data: told } = await db
        .from("reminders")
        .select("id, booking_id, body, status, sent_at")
        .in("booking_id", ids)
        .eq("template_id", madeTemplate);

      /* The whole point. One, not one per day. */
      if ((told ?? []).length === 1) {
        ok("one confirmation for the run, not one per day");
      } else {
        bad(
          `${(told ?? []).length} confirmations for ${days.length} visits`,
          "somebody who booked once is told that many times",
        );
      }

      const one = (told ?? [])[0];
      if (one?.body) {
        if (new RegExp(`${days.length} visits`).test(one.body)) {
          ok(`and it says what the run is: "${one.body}"`);
        } else {
          bad(
            "the confirmation describes one visit rather than the run",
            one.body,
          );
        }
      } else if (one) {
        bad("the confirmation went with no words in it", `row ${one.id}`);
      }

      /* And it is hung off the first day, which is the one it describes from. */
      const head = booked.find((b) => !b.repeat_parent_id);
      if (one && head && one.booking_id === head.id) {
        ok("it is against the first visit of the run");
      } else if (one) {
        bad("the confirmation is against the wrong visit of the run");
      }
    } catch (e) {
      bad("the confirmation run did not finish", e.message);
    } finally {
      await browser2.close();
      const { data: mine } = await db
        .from("bookings")
        .select("id")
        .ilike("title", `%${runTag}%`);
      for (const b of mine ?? []) await db.from("reminders").delete().eq("booking_id", b.id);
      await db.from("bookings").delete().ilike("title", `%${runTag}%`);
      await db.from("contacts").delete().ilike("name", `%${runTag}%`);
      if (madeTemplate) await db.from("reminder_templates").delete().eq("id", madeTemplate);
      ok("that run, its client and its wording taken back out");
    }
  }


  /*
   * ── Changing one of a run, and the ones after it ──────────────────────────
   *
   * Giles, 1 Oct: "if the booking had repeating events it doesn't let you update
   * future events, can you make it have the option to do so."
   *
   * One press writes to several rows, which is the shape that needs checking in
   * the database rather than on the screen. Three things would each be silent:
   * the later ones not moving at all, the earlier ones moving when they should
   * not, and the time drifting rather than landing on what was asked for.
   */
  async function changesTheRest() {
    const runTag = `zz-rest-${randomBytes(4).toString("hex")}`;
    const days = [dayFromNow(70), dayFromNow(71), dayFromNow(72), dayFromNow(73)];

    console.log(`
  A run of ${days.length}, then moving it from the second one on
`);

    const browser3 = await chromium.launch({ channel: "chrome", headless: true });
    const context3 = await browser3.newContext({ viewport: { width: 1280, height: 1000 } });

    try {
      const page = await signIn(context3, owner.user_id, "/diary");
      await page.getByRole("button", { name: /^Add something/ }).click();
      await page
        .getByRole("button", { name: /Time off, or something that is not a client/i })
        .first()
        .click();

      const sheet = page.locator("form").filter({ has: page.locator('input[name="date"]') }).first();
      await sheet.locator('input[name="date"]').fill(days[0]);
      await sheet.locator('input[name="start_time"]').fill("09:00");
      await sheet.locator('input[name="title"], input[name="contact_name"]').first().fill(runTag);
      await sheet.locator('select[name="repeats"]').selectOption("dates");
      for (const [i, day] of days.slice(1).entries()) {
        await sheet.getByRole("button", { name: /Add another day/i }).click();
        await sheet.locator('input[type="date"]').nth(i + 1).fill(day);
      }
      await sheet.getByRole("button", { name: /^Add it$/ }).click();
      await page.waitForTimeout(5000);

      const { data: made } = await db
        .from("bookings")
        .select("id, starts_at")
        .eq("title", runTag)
        .order("starts_at");
      if ((made ?? []).length !== days.length) {
        bad(`${(made ?? []).length} of ${days.length} went in`, "cannot check the rest");
        return;
      }
      ok(`${made.length} booked, all at 09:00`);

      /*
       * Open the SECOND one, so there is something before it that must not move.
       * The commonest real case is "from next week onwards", not "from the start".
       */
      await page.goto(`${SITE}/diary?view=day&day=${days[1]}&entry=${made[1].id}`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(2500);

      const edit = page.locator("form").filter({ has: page.locator('input[name="date"]') }).first();

      /* The choice has to be there at all - it was not, for a run of picked days. */
      const choice = edit.locator('input[name="apply_to"][value="future"]');
      if (!(await choice.count())) {
        bad("there is no option to change the ones after it", "on a run of picked days");
        return;
      }
      ok("the sheet offers to change this one and the ones after it");

      await choice.check();
      await edit.locator('input[name="start_time"]').fill("14:30");
      await edit.getByRole("button", { name: /^Save$/ }).first().click();
      await page.waitForTimeout(6000);

      const { data: after } = await db
        .from("bookings")
        .select("id, starts_at")
        .eq("title", runTag)
        .order("starts_at");

      const clock = (iso) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: studio.timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(iso));

      const times = (after ?? []).map((b) => clock(b.starts_at));

      /* The first is before the one that was edited, so it must be untouched. */
      if (times[0] === "09:00") ok("the one before it is left alone");
      else bad(`the earlier one moved to ${times[0]}`, "history must not be rewritten");

      const later = times.slice(1);
      if (later.length === 3 && later.every((t) => t === "14:30")) {
        ok("and all three from the edited one onwards are at 14:30");
      } else {
        bad("the rest did not all move", later.join(", "));
      }

      /* And each kept its own day, which is the whole point of a set. */
      const dayOf = (iso) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: studio.timezone, dateStyle: "short" })
          .format(new Date(iso))
          .replaceAll("/", "-");
      const landed = (after ?? []).map((b) => dayOf(b.starts_at));
      if (JSON.stringify(landed) === JSON.stringify(days)) {
        ok("every one still on its own day");
      } else {
        bad("the days changed", `${landed.join(" ")} rather than ${days.join(" ")}`);
      }
    } catch (e) {
      bad("the run did not finish", e.message);
    } finally {
      await browser3.close();
      await db.from("bookings").delete().eq("title", runTag);
      ok("that run taken back out");
    }
  }

  console.log("");
  if (faults) {
    console.log(`${faults} fault${faults === 1 ? "" : "s"}.`);
    process.exitCode = 1;
  } else {
    console.log("Booking one thing on several days works, and the rows prove it.");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
