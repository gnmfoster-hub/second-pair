/*
 * Sending an agreement from the back office, which is the half Giles uses.
 *
 *   node scripts/check-agreement-send.cjs
 *
 * check-agreement.cjs proves reading and signing one, and it does that by
 * inserting the row itself. Which leaves the other half untouched: the panel in
 * the back office, the figures typed into it, buildTerms, the insert, and the
 * email. That is the half a client never sees and the only half Giles ever
 * touches, and "the signing page works" says nothing about it.
 *
 * ── What it asserts ─────────────────────────────────────────────────────────
 *
 *   1. The panel is there at all, on a business, for a platform administrator.
 *   2. Pressing send makes exactly one row, with the figures as typed - pounds
 *      turned into pence, which is the arithmetic most likely to be quietly
 *      wrong and the one nobody notices until an invoice.
 *   3. The wording on the row is the wording buildTerms makes, with the money in
 *      it, and the version stamped beside it. This is the frozen copy: it is the
 *      only thing a signature means anything against.
 *   4. A website-only agreement does not promise an assistant. Giles asked for
 *      accounts that are just a website, and the first draft of the terms
 *      mentioned an assistant regardless.
 *
 * Runs on a demo, sends to an address that cannot exist, and removes both
 * agreements afterwards whether it passed or failed.
 */
require("./pw/look.cjs");
const { chromium } = require("playwright-core");
const { signIn, SITE } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");
const { randomBytes } = require("node:crypto");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SLUG = "willow-demo";

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};

(async () => {
  if (!/-demo$/.test(SLUG)) {
    console.error("This sends an agreement. Demos only.");
    process.exit(1);
  }

  /*
   * Somebody the back office will actually let in.
   *
   * isPlatformAdmin reads PLATFORM_ADMIN_EMAILS and compares it with the signed
   * in address. Signing in as anybody else does not fail loudly - every action
   * returns "Not allowed" and the panel is simply absent, which reads exactly
   * like a feature that was never built.
   */
  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!admins.length) {
    console.error("PLATFORM_ADMIN_EMAILS is not set here, so there is nobody to look as.");
    process.exit(1);
  }

  const { data: studio } = await db.from("studios").select("id, name").eq("slug", SLUG).single();
  if (!studio) {
    console.error(`No ${SLUG}.`);
    process.exit(1);
  }

  /* Find a user account for one of the allowed addresses. */
  let adminId = null;
  for (const email of admins) {
    const { data: found } = await db.auth.admin.listUsers({ perPage: 200 });
    const user = (found?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
    if (user) {
      adminId = user.id;
      break;
    }
  }
  if (!adminId) {
    console.error("None of the allowed addresses has an account to sign in with.");
    process.exit(1);
  }

  const tag = randomBytes(4).toString("hex");
  const to = `zz-${tag}@example.invalid`;

  console.log(`\nSending an agreement to ${studio.name} from the back office.\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });

  try {
    const page = await signIn(context, adminId, "/admin");
    if (page.url().includes("/login")) throw new Error("the magic link bounced to /login");

    const body = await page.locator("body").innerText();
    if (/Not allowed|Sign in/i.test(body.slice(0, 200))) {
      throw new Error("the back office refused this account");
    }

    /*
     * ── The right business, addressed by id ──────────────────────────────────
     *
     * The first version of this found the card by its name and took the first
     * match - and sent an agreement naming LIVING CANVAS TATTOO, a live client,
     * while claiming to run on a demo. Nothing was left behind, because the
     * tidy-up removes by address and it ran. But "demos only" was checked
     * against a variable at the top of the file and then not enforced by
     * anything the browser did, which is not a safety rule, it is a comment.
     *
     * So: the card carries data-studio now, everything is scoped inside it, and
     * the form's own studio_id is read back and compared before anything is
     * pressed. Two independent gates, because the one that failed was the one
     * that looked sufficient.
     */
    const card = page.locator(`[data-studio="${studio.id}"]`);
    if (!(await card.count())) {
      bad("could not find that business on the page", "nothing was pressed");
      throw new Error("no card");
    }
    await card.scrollIntoViewIfNeeded().catch(() => {});
    /*
     * "Manage", which is the button that renders the panel at all.
     *
     * Clicking the business name does nothing - it is a heading. The previous
     * run said "there is no agreement panel on this business", which was true
     * and was about a card nobody had opened.
     */
    const manage = card.getByRole("button", { name: /^Manage$/ }).first();
    if (await manage.count()) {
      await manage.click();
      await page.waitForTimeout(900);
    }

    // ------------------------------------------------------- 1. is it there
    const sendOne = card.getByRole("button", { name: /^(Send one|Send another)$/ }).first();
    if (!(await sendOne.count())) {
      bad("there is no agreement panel on this business", "nothing else can be checked");
      throw new Error("no panel");
    }
    ok("the agreement panel is on the business");

    await sendOne.click();
    await page.waitForTimeout(600);

    /* CSS :has rather than filter({has}), which re-scopes its inner locator. */
    const form = card.locator('form:has(input[name="sent_to"])').first();

    /*
     * The gate. Whatever the navigation did, this form is going to act on the
     * business named in its own hidden field, so that is the one asked about.
     */
    const target = await form.locator('input[name="studio_id"]').inputValue();
    if (target !== studio.id) {
      bad("the form on screen belongs to another business", `${target} rather than ${studio.id}`);
      throw new Error("wrong business");
    }
    ok("the form is against the business this check is allowed to touch");

    await form.locator('input[name="sent_to"]').fill(to);
    await form.locator('input[name="includes"]').fill("the assistant");
    await form.locator('input[name="setup_fee"]').fill("250");
    await form.locator('input[name="recurring"]').fill("22.50");
    await form.locator('input[name="notice_days"]').fill("30");

    /*
     * ── A priced schedule, which is where the money now lives ────────────────
     *
     * Giles, 30 Sep: "should really have separate lines to add services and
     * costs etc."
     *
     * Three lines on purpose, and one of them once: it is the mix that has
     * something to go wrong in it. A build and two subscriptions is the ordinary
     * shape of a real agreement here, and it is the shape where the totals are
     * sums rather than figures.
     */
    const SCHEDULE = [
      { what: "A website", amount: "450", when: "once" },
      { what: "The assistant", amount: "20", when: "monthly" },
      { what: "The Receptionist", amount: "15", when: "monthly" },
    ];
    for (const [i, line] of SCHEDULE.entries()) {
      await form.getByRole("button", { name: /^Add (a|another) line$/ }).click();
      const row = form.locator("div").filter({ has: form.locator('select[aria-label="How often"]') });
      await form.locator('input[placeholder="A website"]').nth(i).fill(line.what);
      await form.locator('input[aria-label="Price in pounds"]').nth(i).fill(line.amount);
      await form.locator('select[aria-label="How often"]').nth(i).selectOption(line.when);
      void row;
    }
    await page.waitForTimeout(500);

    /*
     * The totals have to become sums, and have to become uneditable.
     *
     * Two statements of one number is how a document disagrees with itself, and
     * this is a document somebody signs. If the boxes stayed typeable, the prose
     * could say one price while the column the back office adds up said another.
     */
    const setupBox = form.locator('input[name="setup_fee"]');
    const recurringBox = form.locator('input[name="recurring"]');
    const totalsRight =
      (await setupBox.inputValue()) === "450" && (await recurringBox.inputValue()) === "35";
    const locked =
      (await setupBox.getAttribute("readonly")) !== null &&
      (await recurringBox.getAttribute("readonly")) !== null;

    if (totalsRight) ok("the totals are the sums of the lines: £450 once, £35 a month");
    else {
      bad(
        "the totals are not the sums of the lines",
        `${await setupBox.inputValue()} / ${await recurringBox.inputValue()}`,
      );
    }
    if (locked) ok("and they cannot be typed over, so they cannot disagree with them");
    else bad("the totals are still editable beside a schedule", "they can drift apart");

    /*
     * ── The wording, read before anything is sent ─────────────────────────────
     *
     * Giles, 30 Sep: "you can't preview, amend etc." This is the half that was
     * missing entirely - the first person to read the document was the client.
     *
     * Checked against the figures typed above rather than merely "there is some
     * text", because a preview that does not follow the boxes is worse than none:
     * somebody would read it, believe it, and send something else.
     */
    const readIt = form.locator("details").filter({ hasText: /Read it before you send it/ }).first();
    if (!(await readIt.count())) {
      bad("there is no way to read the wording before sending it");
    } else {
      await readIt.locator("summary").click();
      await page.waitForTimeout(400);
      const shown = await readIt.innerText();
      const missing = [
        [/A website: £450, once/, "the first line of the schedule"],
        [/The assistant: £20 a month/, "a recurring line, without a stray comma"],
        [/Once, at the start: £450/, "the once total"],
        [/Then: £35 a month/, "the recurring total"],
        [/30 days' notice/, "the notice period as typed, not the default sixty"],
        [/Everything you give us stays yours/, "the clause about who owns what"],
        [/has to be yours to give/, "the clause about material they supply"],
      ].filter(([pattern]) => !pattern.test(shown));
      if (missing.length === 0) {
        ok("the wording can be read before sending, and follows the figures typed");
      } else {
        bad(
          `the wording shown is missing ${missing.map(([, w]) => w).join("; ")}`,
          shown.slice(0, 120).split(/\s+/).join(" "),
        );
      }

      /*
       * And that it changes when a figure does, which is the whole claim. A
       * preview rendered once and then left behind would pass the check above.
       */
      /* A line changing has to move both the schedule and the total under it. */
      await form.locator('input[aria-label="Price in pounds"]').nth(1).fill("26");
      await page.waitForTimeout(500);
      const again = await readIt.innerText();
      if (/The assistant: £26 a month/.test(again) && /Then: £41 a month/.test(again)) {
        ok("and both the line and the total follow a price being changed");
      } else {
        bad("the wording did not follow a changed line", again.slice(0, 140).split(/\s+/).join(" "));
      }
      await form.locator('input[aria-label="Price in pounds"]').nth(1).fill("20");
      await page.waitForTimeout(400);
    }

    await form.getByRole("button", { name: /Build it and email the link/i }).click();
    await page.waitForTimeout(6000);

    // ---------------------------------------------- 2. one row, figures right
    const { data: rows } = await db
      .from("agreements")
      .select("*")
      .eq("sent_to", to);

    if ((rows ?? []).length !== 1) {
      bad(`${(rows ?? []).length} agreements written`, "expected exactly one");
      throw new Error("wrong count");
    }
    const row = rows[0];
    ok("one agreement written");

    /*
     * Pounds in, pence stored. £22.50 is the case that matters: 2250, not 2249
     * and not 22. Everything about money here is an integer number of pence for
     * the reason every system that got it wrong found out.
     */
    const money =
      Number(row.setup_fee_pence) === 45000 &&
      Number(row.recurring_pence) === 3500 &&
      Number(row.notice_days) === 30;
    if (money) ok("the summed totals stored as 45000 and 3500, and 30 days' notice");
    else {
      bad(
        "the figures are not what was typed",
        `setup ${row.setup_fee_pence}, recurring ${row.recurring_pence}, notice ${row.notice_days}`,
      );
    }

    // ------------------------------------------------ 3. the frozen wording
    const terms = String(row.terms_text ?? "");
    const saysIt = [
      [/A website: £450, once/, "the schedule, line by line"],
      [/The assistant: £20 a month/, "a recurring line, and without a stray comma"],
      [/Once, at the start: £450/, "the once total"],
      [/Then: £35 a month/, "the summed recurring total"],
      [/30 days' notice/, "the notice period as typed, not the default sixty"],
      [/you are the controller of that information and we are your processor/, "the data processing agreement"],
      /*
       * The clause that was actually missing until 30 September. This company
       * builds websites and the agreement said nothing about who owns one.
       */
      [/Everything you give us stays yours/, "who owns what"],
      [/has to be yours to give/, "material the client supplies being theirs to supply"],
      [new RegExp(studio.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toUpperCase()), "who it is with"],
    ].filter(([pattern]) => !pattern.test(terms));

    if (saysIt.length === 0) ok("the wording on the row has the money, the notice and the DPA in it");
    else bad(`the wording is missing ${saysIt.map(([, what]) => what).join("; ")}`, terms.slice(0, 120));

    if (row.terms_version) ok(`stamped with the wording it was built from: ${row.terms_version}`);
    else bad("nothing says which wording this is", "so nobody can say what was signed");

    /*
     * The schedule itself, on the row.
     *
     * The wording carries it in prose either way, because that is built before
     * the insert. This is the other half: the lines as data, so that changing an
     * agreement can read them back into the form rather than making somebody
     * retype four lines to correct one price.
     */
    const stored = Array.isArray(row.lines) ? row.lines : [];
    if (stored.length === 3 && Number(stored[0]?.pence) === 45000 && stored[0]?.when === "once") {
      ok("the three lines are stored as data, not only as prose");
    } else {
      bad(`${stored.length} lines stored`, JSON.stringify(stored).slice(0, 110));
    }

    if (row.token && row.sent_at) ok("it has a link and a sent date");
    else bad("no link or no sent date", `token ${row.token ? "yes" : "no"}`);

    /* And the link actually opens, which is the proxy entry doing its job. */
    if (row.token) {
      const opened = await context.newPage();
      const res = await opened.goto(`${SITE}/a/${row.token}`, { waitUntil: "domcontentloaded" });
      const shown = await opened.locator("body").innerText();
      if (res?.status() === 200 && /A website: £450, once/.test(shown)) {
        ok("and the link opens on the agreement it made");
      } else {
        bad("the link does not open on the agreement", `status ${res?.status()}`);
      }
      await opened.close();
    }

    // ------------------------------------------- 4. changing an unsigned one
    /*
     * Giles, 30 Sep: "you can't preview, amend etc."
     *
     * Changing one is not an edit and must never become one: the wording is
     * frozen when it is sent, and that freeze is the only reason a signature
     * means anything. So the old one is withdrawn and a new one stands in its
     * place, and the four things worth proving are that the form arrives filled
     * in, that the change actually lands, that the old one is withdrawn, and
     * that the old link stops working.
     */
    const changeIt = card.getByRole("button", { name: /^Change it$/ }).first();
    if (!(await changeIt.count())) {
      bad("there is no way to change an unsigned agreement");
    } else {
      await changeIt.click();
      await page.waitForTimeout(900);

      const form3 = card.locator('form:has(input[name="sent_to"])').first();
      const filled = {
        to: await form3.locator('input[name="sent_to"]').inputValue(),
        recurring: await form3.locator('input[name="recurring"]').inputValue(),
        notice: await form3.locator('input[name="notice_days"]').inputValue(),
        replaces: await form3.locator('input[name="replaces"]').inputValue().catch(() => ""),
      };

      if (filled.to === to && filled.recurring === "35" && filled.notice === "30") {
        ok("changing one opens the form already filled in from it");
      } else {
        bad(
          "the form did not arrive filled in from the agreement",
          `${filled.to} / ${filled.recurring} / ${filled.notice}`,
        );
      }
      if (filled.replaces === row.id) ok("and it knows which one it replaces");
      else bad("it does not know which one it replaces", filled.replaces || "nothing");

      /*
       * The schedule has to come back too, or correcting one price means retyping
       * four lines - which is the whole reason changing one exists.
       */
      const backAgain = await form3.locator('input[placeholder="A website"]').count();
      if (backAgain === 3) ok("and the three lines come back with it");
      else bad(`${backAgain} lines came back`, "correcting one price would mean retyping them");

      /*
       * Change a LINE, not the total. The total is read-only beside a schedule -
       * the first version of this tried to type into it and Playwright refused,
       * correctly, which is the product doing exactly what it should.
       */
      await form3.locator('input[aria-label="Price in pounds"]').nth(1).fill("35");
      await page.waitForTimeout(500);
      await form3.getByRole("button", { name: /Replace it and email the new link/i }).click();
      await page.waitForTimeout(6000);

      const { data: after } = await db
        .from("agreements")
        .select("id, recurring_pence, void_at, token, terms_text")
        .eq("studio_id", studio.id)
        .order("created_at", { ascending: false });

      const replacement = (after ?? []).find((a) => Number(a.recurring_pence) === 5000);
      const original = (after ?? []).find((a) => a.id === row.id);

      if (replacement) ok("the corrected one was sent, at the new price");
      else bad("no corrected agreement was written", "the change went nowhere");

      if (original?.void_at) ok("and the one it replaced is withdrawn");
      else bad("the old agreement is still live", "two sets of terms, both openable");

      /* The old link has to stop working, or they can still sign the wrong one. */
      if (original?.token) {
        const stale = await context.newPage();
        await stale.goto(`${SITE}/a/${original.token}`, { waitUntil: "domcontentloaded" });
        const said = await stale.locator("body").innerText();
        if (/not available/i.test(said)) ok("the old link no longer opens");
        else bad("the old link still opens", said.slice(0, 80).split(/\s+/).join(" "));
        await stale.close();
      }

      /* And the new wording says the new price, frozen onto the new row. */
      if (replacement && /Then: £50 a month/.test(String(replacement.terms_text ?? ""))) {
        ok("the new wording carries the corrected price");
      } else if (replacement) {
        bad("the corrected wording does not say the new price");
      }
    }

    // ------------------------------- 4. a website-only one promises no assistant
    const siteTo = `zz-${tag}-site@example.invalid`;
    /* Re-opened from the card, because saving one collapses the form. */
    const again = card.getByRole("button", { name: /^(Send one|Send another)$/ }).first();
    await again.click();
    await page.waitForTimeout(600);
    const form2 = card.locator('form:has(input[name="sent_to"])').first();
    const target2 = await form2.locator('input[name="studio_id"]').inputValue();
    if (target2 !== studio.id) throw new Error("the second form belongs to another business");
    await form2.locator('input[name="sent_to"]').fill(siteTo);
    await form2.locator('input[name="includes"]').fill("a website");
    await form2.locator('input[name="recurring"]').fill("0");
    await form2.getByRole("button", { name: /Build it and email the link/i }).click();
    await page.waitForTimeout(6000);

    const { data: siteRows } = await db.from("agreements").select("terms_text").eq("sent_to", siteTo);
    const siteTerms = String(siteRows?.[0]?.terms_text ?? "");
    if (!siteTerms) {
      bad("a website-only agreement was not written");
    } else {
      const gettingSection = siteTerms.split("1. WHAT YOU ARE GETTING")[1]?.split("2.")[0] ?? "";
      if (/taking on a website/.test(siteTerms) && !/assistant/i.test(gettingSection)) {
        ok("a website-only agreement says nothing about an assistant");
      } else {
        bad("a website-only agreement mentions an assistant", gettingSection.slice(0, 100));
      }
    }
  } catch (e) {
    bad("the run did not finish", e.message);
  } finally {
    await browser.close();
    const { error } = await db.from("agreements").delete().like("sent_to", `zz-${tag}%`);
    if (error) bad("could not remove the check's own agreements", error.message);
    else ok("the check's own agreements taken back out");
  }

  console.log("");
  if (faults) {
    console.log(`${faults} fault${faults === 1 ? "" : "s"}.`);
    process.exitCode = 1;
  } else {
    console.log("An agreement can be built and sent from the back office.");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
