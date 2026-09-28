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
 *   3. The time is the same on each, in the business's own zone. Adding days in
 *      milliseconds is how a Tuesday five o'clock visit becomes four o'clock in
 *      November, which nobody would notice for a week.
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
    await sheet.locator('input[name="start_time"]').fill("09:00");

    /*
     * The title field is named differently depending on what the add menu said,
     * so whichever of the two is actually on the page gets it.
     */
    const title = sheet.locator('input[name="title"], input[name="contact_name"]').first();
    await title.fill(tag);

    /* The control this whole check is about. */
    await sheet.locator('select[name="repeats"]').selectOption("dates");

    for (const [i, day] of picked.entries()) {
      await sheet.getByRole("button", { name: /Add another day/i }).click();
      await sheet.locator('input[type="date"]').nth(i + 1).fill(day);
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

      /* 3 — the same wall-clock time on each, in the business's own zone. */
      const times = new Set(
        live.map((r) =>
          new Intl.DateTimeFormat("en-GB", {
            timeZone: studio.timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(r.starts_at)),
        ),
      );
      if (times.size === 1) ok(`each one is at ${[...times][0]} where the business is`);
      else bad("the time drifts between days", [...times].join(", "));

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
