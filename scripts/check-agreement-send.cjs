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
      Number(row.setup_fee_pence) === 25000 &&
      Number(row.recurring_pence) === 2250 &&
      Number(row.notice_days) === 30;
    if (money) ok("£250 and £22.50 stored as 25000 and 2250, and 30 days' notice");
    else {
      bad(
        "the figures are not what was typed",
        `setup ${row.setup_fee_pence}, recurring ${row.recurring_pence}, notice ${row.notice_days}`,
      );
    }

    // ------------------------------------------------ 3. the frozen wording
    const terms = String(row.terms_text ?? "");
    const saysIt = [
      [/Setting up: £250, once/, "the set-up fee"],
      [/Then: £22\.50 a month/, "what it costs after that"],
      [/30 days' notice/, "the notice period as typed, not the default sixty"],
      [/you are the controller of that information and we are your processor/, "the data processing agreement"],
      [new RegExp(studio.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toUpperCase()), "who it is with"],
    ].filter(([pattern]) => !pattern.test(terms));

    if (saysIt.length === 0) ok("the wording on the row has the money, the notice and the DPA in it");
    else bad(`the wording is missing ${saysIt.map(([, what]) => what).join("; ")}`, terms.slice(0, 120));

    if (row.terms_version) ok(`stamped with the wording it was built from: ${row.terms_version}`);
    else bad("nothing says which wording this is", "so nobody can say what was signed");

    if (row.token && row.sent_at) ok("it has a link and a sent date");
    else bad("no link or no sent date", `token ${row.token ? "yes" : "no"}`);

    /* And the link actually opens, which is the proxy entry doing its job. */
    if (row.token) {
      const opened = await context.newPage();
      const res = await opened.goto(`${SITE}/a/${row.token}`, { waitUntil: "domcontentloaded" });
      const shown = await opened.locator("body").innerText();
      if (res?.status() === 200 && /Setting up: £250/.test(shown)) {
        ok("and the link opens on the agreement it made");
      } else {
        bad("the link does not open on the agreement", `status ${res?.status()}`);
      }
      await opened.close();
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
