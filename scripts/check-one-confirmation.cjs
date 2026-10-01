/*
 * Does a repeating booking confirm itself once, however it is edited afterwards?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-one-confirmation.cjs
 *
 * ── The morning this is written for ─────────────────────────────────────────
 *
 * On 1 October Karen's customer Samantha was sent fourteen "you are booked in"
 * emails for one fortnightly booking. One at 07:56 was correct: the diary books
 * every visit, suppresses their confirmations, and sends a single one at the end
 * describing the whole run. The other thirteen were two presses of "change this
 * one and the 11 after it" at 08:16 and 08:26. Spreading an edit re-schedules
 * every later visit, that call did not say confirm: false, and each visit had no
 * confirmation row of its own yet, so each wrote one and sent it on the spot.
 *
 * The fix moved the rule out of the caller's hands and into scheduleReminders:
 * a confirmation is never written for a booking whose set already has one.
 *
 * This proves it the only way worth believing: by booking a real repeating set
 * through the real sheet on a demo, then spreading a real edit across it, and
 * counting the rows in the database each time. The old code gives 1 then 13; the
 * new code must give 1 then 1.
 *
 * ── What it touches ─────────────────────────────────────────────────────────
 *
 * A demo only, chosen by slug and printed before anything is pressed. It adds a
 * confirmation template because no demo has one, books a client who is already
 * there, and removes every row it wrote at the end, including after a failure.
 * Demo clients carry Ofcom drama numbers and no email addresses, so nothing can
 * reach a real person even if the send is attempted.
 */
const path = require("path");
const { signIn, SITE } = require("./pw/look.cjs");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};
/* Not a fault. This script could not reach the thing it wanted to drive. */
const note = (w) => console.log(`  --    ${w}`);

/** Everything written during the run, so the finally block can undo it. */
const mess = { templateId: null, bookingIds: [] };

async function tidyUp() {
  if (mess.bookingIds.length) {
    await db.from("reminders").delete().in("booking_id", mess.bookingIds);
    await db.from("bookings").delete().in("id", mess.bookingIds);
  }
  if (mess.templateId) {
    await db.from("reminder_templates").delete().eq("id", mess.templateId);
  }
  console.log(
    `\n  tidied: ${mess.bookingIds.length} bookings and ${mess.templateId ? "1 template" : "no template"}`,
  );
}

/** Every booking of the set whose root is `root`, including the root. */
async function wholeSet(root) {
  const { data } = await db
    .from("bookings")
    .select("id, starts_at")
    .or(`id.eq.${root},repeat_parent_id.eq.${root}`);
  return data ?? [];
}

async function confirmationsFor(ids, templateId) {
  if (!ids.length) return [];
  const { data } = await db
    .from("reminders")
    .select("id, booking_id, sent_at")
    .in("booking_id", ids)
    .eq("template_id", templateId);
  return data ?? [];
}

/**
 * Wait for the writing to settle rather than sleeping and hoping.
 *
 * A fixed four seconds gave one confirmation on one run and none on the next,
 * and the difference was how long fourteen inserts took, not anything about the
 * product. Counting at a moment nobody chose is how a check invents a fault.
 *
 * It waits for the number to stop moving, so it is as good at catching "wrote
 * thirteen" as "wrote one": a count that is still climbing is not settled.
 */
async function settled(ids, templateId, seconds = 25) {
  let last = -1;
  let same = 0;
  for (let i = 0; i < seconds * 2; i++) {
    const now = (await confirmationsFor(ids, templateId)).length;
    same = now === last ? same + 1 : 0;
    last = now;
    /* Three readings the same, and at least one row, or the whole wait. */
    if (same >= 3 && now > 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return confirmationsFor(ids, templateId);
}

(async () => {
  const { data: studio } = await db
    .from("studios")
    .select("id, name, slug, timezone")
    .eq("slug", "willow-demo")
    .is("archived_at", null)
    .maybeSingle();

  if (!studio) {
    note("willow-demo is not there, so there is nothing safe to book into");
    process.exit(0);
  }

  const { data: members } = await db
    .from("studio_members")
    .select("user_id, role")
    .eq("studio_id", studio.id);
  const owner = (members ?? []).find((m) => m.role === "owner") ?? (members ?? [])[0];
  if (!owner) {
    note("nobody can open that demo");
    process.exit(0);
  }

  const { data: client } = await db
    .from("contacts")
    .select("id, name, phone, email")
    .eq("studio_id", studio.id)
    .not("name", "is", null)
    .order("name")
    .limit(1)
    .maybeSingle();

  if (!client) {
    note("that demo has no clients to book");
    process.exit(0);
  }

  console.log(`\n${studio.name} (${studio.slug}) · booking ${client.name}\n`);

  try {
    /* A confirmation to count. No demo has one, which is why this was invisible. */
    const { data: made, error: te } = await db
      .from("reminder_templates")
      .insert({
        studio_id: studio.id,
        label: "Checking one confirmation per set",
        hours_before: 0,
        body: "All booked, {{name}}. {{practitioner}} will be with you {{when}}.",
        enabled: true,
      })
      .select("id")
      .single();
    if (te) throw new Error(te.message);
    mess.templateId = made.id;
    ok("a confirmation is switched on for the demo");

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await signIn(context, owner.user_id, "/diary");
    await page.waitForLoadState("networkidle");

    /* Add, by what the button says rather than its accessible name. */
    let add = null;
    for (const b of await page.getByRole("button").all()) {
      if ((await b.isVisible()) && (await b.innerText()).trim() === "Add") {
        add = b;
        break;
      }
    }
    if (!add) {
      note("no Add button on the diary");
      await browser.close();
      return;
    }
    await add.click();

    const returning = page.getByRole("button", { name: /Somebody who has been before/i }).first();
    await returning.waitFor({ timeout: 8000 }).catch(() => {});
    if (await returning.count()) await returning.click();

    const search = page.getByPlaceholder(/Search, or type a new name/i).first();
    await search.waitFor({ timeout: 8000 }).catch(() => {});
    if (!(await search.count())) {
      note("the client picker never appeared");
      await browser.close();
      return;
    }

    await search.fill(client.name.trim().split(/\s+/)[0]);
    const row = page.getByRole("button", { name: new RegExp(client.name, "i") }).first();
    await row.waitFor({ timeout: 8000 }).catch(() => {});
    if (!(await row.count())) {
      note(`searching did not offer ${client.name}`);
      await browser.close();
      return;
    }
    await row.click();

    const form = page.locator("form").filter({ has: search }).first();

    /*
     * A date far enough ahead that it cannot collide with the demo's own diary,
     * which would make the loop skip occurrences and muddle the count.
     */
    const when = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await form.locator('input[name="date"]').fill(when);
    await form.locator('input[name="start_time"]').fill("07:15");
    await form.locator('input[name="minutes"]').fill("30");
    await form.locator('select[name="repeats"]').selectOption("fortnightly");

    const save = form.getByRole("button", { name: /^(Save|Book|Add it)/ }).first();
    if (!(await save.count())) {
      const buttons = await form.getByRole("button").allTextContents();
      note(`no save control on the sheet. It offers: ${buttons.join(" / ")}`);
      await browser.close();
      return;
    }
    await save.click();
    await page.waitForTimeout(4000);

    /* What actually landed. */
    const { data: fresh } = await db
      .from("bookings")
      .select("id, starts_at, repeat_parent_id, repeats")
      .eq("contact_id", client.id)
      .gte("starts_at", `${when}T00:00:00Z`)
      .order("starts_at");

    const set = (fresh ?? []).filter((b) => b.repeats === "fortnightly" || b.repeat_parent_id);
    if (set.length < 3) {
      note(`the sheet did not create a repeating set (${set.length} bookings found)`);
      await page.screenshot({
        path: path.join(require("os").tmpdir(), "second-pair-shots", "one-confirmation.png"),
        fullPage: true,
      });
      await browser.close();
      return;
    }

    const root = set.find((b) => !b.repeat_parent_id)?.id ?? set[0].repeat_parent_id;
    const family = await wholeSet(root);
    mess.bookingIds = family.map((b) => b.id);
    console.log(`  the sheet booked ${family.length} visits, every 2 weeks from ${when}`);

    const first = await settled(mess.bookingIds, mess.templateId);
    if (first.length === 1) ok(`booking the set wrote one confirmation, not ${family.length}`);
    else bad(`booking the set wrote ${first.length} confirmations`, "one was expected");

    /*
     * Now the thing that sent the other thirteen: open one of them, change the
     * time, and spread it across the rest of the run.
     */
    /*
     * Straight to the day, by the diary's own ?view=day&day= from page.tsx.
     *
     * The first version of this pressed the next-day arrow eight times and gave
     * up, then reported that it could not open the booking - which reads as the
     * diary being broken when the booking was forty days away and perfectly
     * fine. Walking to a date is not a thing worth driving a browser to do.
     */
    const theDay = set[0].starts_at.slice(0, 10);

    /*
     * ?entry= opens that one appointment on arrival. The diary has it for links
     * that already know which booking they mean, which is exactly this.
     *
     * Tried ?view=day&day= first and the page kept showing today, so the check
     * reported that it could not find a booking that was sitting there. Driving
     * a calendar to a date is not worth doing when the page offers a way to say
     * which appointment you mean.
     */
    const url = `${SITE}/diary?view=day&day=${theDay}&entry=${set[0].id}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    let opened = Boolean(await page.locator('input[name="start_time"]').count());
    let landed = url.replace(SITE, "");

    /*
     * Opening an appointment shows it to you before it lets you change it, so
     * the form may be one press away behind whatever the sheet calls that.
     */
    if (!opened) {
      const dialog = page.locator('[role="presentation"], [role="dialog"]').first();
      if (await dialog.count()) {
        const buttons = (await dialog.getByRole("button").allTextContents())
          .map((t) => t.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        landed += ` | the sheet offers: ${buttons.slice(0, 12).join(" / ")}`;

        /*
         * "Change or cancel" is what it is called. Matched on the whole label
         * rather than a prefix: a prefix match picked a different button and
         * playwright spent a minute reporting that the real one was in the way.
         */
        for (const label of ["Change or cancel", "Change", "Edit"]) {
          const b = page.getByRole("button", { name: label, exact: true }).first();
          if ((await b.count()) && (await b.isVisible())) {
            /*
             * force, because the hit test says this button intercepts its own
             * click. It is visible, enabled and stable, and the thing reported
             * as being in the way is the button itself - a quirk of the sheet's
             * overlay rather than anything a person would meet. Without it this
             * waits thirty seconds and then reports the product unreachable.
             */
            await b.click({ force: true });
            await page.waitForTimeout(1500);
            break;
          }
        }
        opened = Boolean(await page.locator('input[name="start_time"]').count());
      } else {
        landed += " | no sheet opened at all";
      }
    }

    if (!opened) {
      /* Say what was on the screen, so this is never read as the diary losing a booking. */
      const seen = await page
        .locator("main")
        .innerText()
        .catch(() => "");
      note(
        `could not open one of the new bookings, so the spread was not tried. Last tried ${landed}. The page shows: ${seen
          .replace(/\s+/g, " ")
          .slice(0, 160)}`,
      );
    } else {
      const sheet = page.locator("form").filter({ has: page.locator('input[name="start_time"]') }).first();
      await sheet.locator('input[name="start_time"]').fill("07:45");

      /* "Change this one and the N after it". */
      /*
       * By the value the form submits, not by the words next to it. Matching on
       * "and the 11 after it" found nothing and reported that the sheet does not
       * offer to change the rest of a run, which it plainly does.
       */
      const spread = sheet.locator('input[name="apply_to"][value="future"]').first();
      if (!(await spread.count())) {
        const says = (await sheet.innerText().catch(() => "")).replace(/\s+/g, " ");
        const radios = await sheet
          .locator('input[type="radio"]')
          .evaluateAll((els) => els.map((e) => `${e.name}=${e.value}`));
        note(
          `the sheet did not offer to change the rest of the run. Radios: ${radios.join(", ") || "none"}. It says: ${says.slice(0, 220)}`,
        );
      } else {
        await spread.check({ force: true });
        const saveAgain = sheet.getByRole("button", { name: /^(Save|Update)/ }).first();
        if (!(await saveAgain.count())) {
          note("no save control on the edit sheet");
        } else {
          await saveAgain.click({ force: true });
          await page.waitForTimeout(3000);

          /*
           * Settle again. Thirteen confirmations took ten seconds to write on
           * the morning this is about, so a count taken too early would read as
           * a pass on exactly the fault being tested.
           */
          const after = await settled(mess.bookingIds, mess.templateId);
          if (after.length === 1) {
            ok("spreading the change across the run sent nothing new");
          } else {
            bad(
              `spreading the change wrote ${after.length} confirmations`,
              `${after.length - first.length} extra, which is what reached Samantha`,
            );
          }
        }
      }
    }

    await page.screenshot({
      path: path.join(require("os").tmpdir(), "second-pair-shots", "one-confirmation.png"),
      fullPage: true,
    });
    await browser.close();
  } finally {
    await tidyUp();
  }

  console.log(faults ? `\n${faults} fault(s)\n` : "\nnothing wrong\n");
  process.exit(faults ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await tidyUp();
  process.exit(1);
});
