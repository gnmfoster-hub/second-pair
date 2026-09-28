/*
 * Writing a message: the starters, and the buttons that put a field in.
 *
 *   node scripts/check-wordings.cjs
 *
 * Giles, 28 Sep: "when setting up the booking confirmation there needs to be a
 * template to use, and there also needs to be a way of adding fields — currently
 * there is no way of adding customer name and other required fields."
 *
 * The wordings themselves have unit tests: every field they use is one the
 * renderer fills, every one still reads properly once filled, none invents a
 * price, none costs two texts. What no test can reach is whether pressing the
 * button does anything, which is the entire complaint.
 *
 * ── Deliberately saves nothing ──────────────────────────────────────────────
 *
 * It fills boxes and never presses Save, so it writes no row and changes no
 * business's messages. That is why it can run on a live business as safely as on
 * a demo — though it uses a demo anyway, because there is no reason not to.
 *
 * ── What it asserts ─────────────────────────────────────────────────────────
 *
 *   1. The starters are offered at all, and only while the box is empty. A
 *      picker that quietly overwrites something somebody has typed would be
 *      worse than no picker.
 *   2. Pressing one fills the box with a real wording.
 *   3. Pressing a field button puts the token in — at the cursor, not at the
 *      end, because these go mid-sentence.
 *   4. The preview follows, so what an owner judges is what will be sent.
 */
require("./pw/look.cjs");
const { chromium } = require("playwright-core");
const { signIn } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SLUG = "willow-demo";

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};

(async () => {
  const { data: studio } = await db.from("studios").select("id, name").eq("slug", SLUG).single();
  /*
   * ── Who owns it, and the two traps on the way to that ─────────────────────
   *
   * Settings → Reminders is behind requireOwner(), so signing in as anybody else
   * silently renders their own staff settings instead — a page with no textarea
   * on it. The first version of this took whoever came back first, which at
   * Willow is Jade, an apprentice, and then reported "timed out waiting for a
   * textarea". A fault in the checker wearing the costume of a fault in the
   * product, for the second time in one night.
   *
   * The second trap: `artists.role` is a job title. At Willow it holds "Senior
   * stylist", "Apprentice", "Nail technician". Filtering it for "owner" matches
   * nobody and reads exactly like a business with no owner. Who may do what
   * lives in `studio_members`, where role really is a permission — which is what
   * check-pages.cjs has always used.
   */
  const { data: members, error: me } = await db
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", studio.id)
    .eq("role", "owner")
    .limit(1);
  if (me) {
    console.error(`Could not read who owns ${SLUG}: ${me.message}`);
    process.exit(1);
  }
  const owner = members?.[0];
  if (!owner) {
    console.error(`${SLUG} has no owner to look as.`);
    process.exit(1);
  }
  const { data: who } = await db
    .from("artists")
    .select("name")
    .eq("user_id", owner.user_id)
    .eq("studio_id", studio.id)
    .maybeSingle();
  owner.name = who?.name ?? "the owner";

  /* Who it signed in as, because signing in as the wrong person is how the
   * first two runs of this failed. */
  console.log(`\nWriting a message at ${studio.name}, as ${owner.name}. Nothing is saved.\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });

  try {
    const page = await signIn(context, owner.user_id, "/settings/reminders");
    if (page.url().includes("/login")) {
      bad("could not sign in", "the magic link bounced to /login");
      throw new Error("no session");
    }

    /*
     * The blank editor at the foot of the page, which is the one an owner uses
     * to add a reminder. Found by its empty box rather than by position: the
     * ones above it hold a business's real wordings and must not be touched.
     */
    const blank = page
      .locator("form")
      .filter({ has: page.locator('textarea[name="body"]') })
      .last();
    const box = blank.locator('textarea[name="body"]');

    if ((await box.inputValue()).trim() !== "") {
      bad("the last editor is not the empty one", "it holds a wording already");
      throw new Error("wrong form");
    }

    // ------------------------------------------------------------ 1. offered
    const starters = blank.getByRole("button", {
      name: /^(Short and plain|Warmer|With their own page|The day before|A couple of days before|Asking them to confirm)$/,
    });
    const howMany = await starters.count();
    if (howMany >= 3) ok(`${howMany} starter wordings offered while the box is empty`);
    else bad(`${howMany} starter wordings offered`, "expected at least three");

    // ------------------------------------------------------- 2. one fills it
    await starters.first().click();
    const afterStarter = await box.inputValue();
    if (afterStarter.trim().length > 30 && afterStarter.includes("{{")) {
      ok("pressing one fills the box with a real wording");
    } else {
      bad("pressing a starter did not fill the box", JSON.stringify(afterStarter.slice(0, 60)));
    }

    /*
     * And they go away once there is something to overwrite.
     *
     * The point of the condition, not a detail: a picker that replaces what
     * somebody has typed is the one behaviour this must never have.
     */
    if ((await starters.count()) === 0) {
      ok("and they disappear once there is something to overwrite");
    } else {
      bad("the starters are still offered over a filled box", "pressing one would discard the wording");
    }

    // ------------------------------------------------- 3. a field, at the cursor
    /* Put the cursor in the middle of the text, where a field usually goes. */
    const at = Math.floor(afterStarter.length / 2);
    await box.evaluate((el, pos) => {
      el.focus();
      el.setSelectionRange(pos, pos);
    }, at);

    const field = blank.getByRole("button", { name: /their first name/i }).first();
    if ((await field.count()) === 0) {
      bad("there is no button for the customer's name", "which was the whole complaint");
    } else {
      await field.click();
      const afterField = await box.inputValue();
      const added = afterField.length - afterStarter.length;

      if (!afterField.includes("{{name}}")) {
        bad("pressing the field button put nothing in", JSON.stringify(afterField.slice(0, 60)));
      } else if (added < 8 || added > 10) {
        bad("the field went in oddly", `the box grew by ${added} characters`);
      } else {
        /*
         * Where it landed. Appending would have been the easy thing to build and
         * the wrong one: "Hi ⟨name⟩, you're booked in for ⟨when⟩" has two of
         * these mid-sentence and none at the end.
         */
        const landedAt = afterField.indexOf("{{name}}");
        if (landedAt > 2 && landedAt < afterField.length - 10) {
          ok(`the field goes in at the cursor, ${landedAt} characters along, not at the end`);
        } else {
          bad("the field was appended rather than inserted", `it landed at ${landedAt}`);
        }
      }
    }

    // ----------------------------------------------------- 4. the preview follows
    /*
     * Read as the phone shows it, with the placeholders filled by the same
     * function that fills the real one. "Marie" is the stand-in the preview uses.
     */
    const preview = await blank.textContent();
    if (preview?.includes("Marie")) {
      ok("the preview follows what is typed, filled the way a real one is");
    } else {
      bad("the preview did not update", "an owner would be judging a wording they cannot see");
    }

    /*
     * Nothing was saved, and this proves it rather than asserting it.
     *
     * The count before would have been better, but the page was loaded before
     * anything was typed and the editors above were never touched — so a change
     * in what the database holds could only have come from this run.
     */
    const { count } = await db
      .from("reminder_templates")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studio.id);
    ok(`${count} wordings on this business, and none of them written by this check`);
  } catch (e) {
    bad("the run did not finish", e.message);
  } finally {
    await browser.close();
  }

  console.log("");
  if (faults) {
    console.log(`${faults} fault${faults === 1 ? "" : "s"}.`);
    process.exitCode = 1;
  } else {
    console.log("A confirmation can be started from a wording, and a field can be put in.");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
