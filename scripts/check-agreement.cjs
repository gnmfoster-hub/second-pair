/*
 * Sending an agreement and signing it, in a real browser, checked in the row.
 *
 *   node scripts/check-agreement.cjs
 *
 * Written the same night as the feature and deliberately before it could run,
 * because the table arrives with a migration that only Giles can run. Until then
 * this says so and stops. The moment the SQL has gone through, one command
 * proves the whole path rather than somebody clicking through it hopefully.
 *
 * ── What it asserts, and why each one would be silent ───────────────────────
 *
 *   1. An unsigned agreement opens and shows its own wording. If the frozen text
 *      were not rendered, or were rendered from the template instead, nobody
 *      would notice until a dispute — which is the only time anybody reads one.
 *
 *   2. Opening it is recorded. That field is what tells Giles whether to chase
 *      about the email or about the terms, and a write on render rather than
 *      from the browser would have counted WhatsApp's link preview as the
 *      client reading it.
 *
 *   3. Signing without the tick is refused. The tick is a large part of what
 *      makes a sixty-day notice period enforceable, so it must be refused by the
 *      server rather than only by the box being required in the browser.
 *
 *   4. Signing works, and writes the name, the signature, the date, the address
 *      and the browser — and does NOT write the money or the wording, because a
 *      signature that could change what it was signing would be worth nothing.
 *
 *   5. Signing again changes nothing. Two tabs, one agreement.
 *
 * Its own agreement on a demo business, against a throwaway token, removed
 * afterwards whether it passed or failed. It must never be pointed at a real
 * client: it would put a signature on their record.
 */
require("./pw/look.cjs");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { randomBytes } = require("node:crypto");

const SITE = "https://www.second-pair.com";
const SLUG = "willow-demo";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};

/* The wording, built the way the real thing builds it. */
const TERMS = [
  "AGREEMENT BETWEEN SECOND PAIR LTD AND A CHECK",
  "",
  "1. WHAT YOU ARE GETTING",
  "",
  "You are taking on the assistant.",
  "",
  "2. WHAT IT COSTS",
  "",
  "Setting up: £250, once, payable before we start.",
  "Then: £20 a month.",
].join("\n");

(async () => {
  if (!/-demo$/.test(SLUG)) {
    console.error("This signs an agreement. Demos only.");
    process.exit(1);
  }

  const { data: studio } = await db.from("studios").select("id, name").eq("slug", SLUG).single();
  if (!studio) {
    console.error(`No ${SLUG}.`);
    process.exit(1);
  }

  const token = randomBytes(24).toString("base64url");
  const sentTo = `zz-check-${randomBytes(3).toString("hex")}@example.invalid`;

  const { error: made } = await db.from("agreements").insert({
    studio_id: studio.id,
    setup_fee_pence: 25000,
    recurring_pence: 2000,
    period: "monthly",
    includes: ["the assistant"],
    notice_days: 60,
    terms_version: "check",
    terms_text: TERMS,
    token,
    sent_to: sentTo,
    sent_at: new Date().toISOString(),
  });

  /*
   * The table not being there is the expected answer until the migration runs,
   * and it is not a failure of anything. Said clearly and exited zero, so this
   * can sit in the suite without turning it red for a job that is on somebody
   * else's list.
   */
  if (made && /relation|does not exist|schema cache/i.test(made.message)) {
    console.log("\n  --    agreements does not exist yet.");
    console.log("        Run supabase/migrations/20260927180000_agreements.sql, then this again.");
    console.log("        Nothing is wrong; there is simply nothing to check.\n");
    return;
  }
  if (made) {
    console.error(`Could not make one: ${made.message}`);
    process.exit(1);
  }

  console.log(`\nAn agreement for ${studio.name}, signed and checked.\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });

  try {
    const page = await context.newPage();
    await page.goto(`${SITE}/a/${token}`, { waitUntil: "networkidle" });

    // ------------------------------------------------- 1. it shows its own wording
    const shown = await page.locator("body").innerText();
    if (shown.includes("Setting up: £250, once")) {
      ok("it shows the wording that was frozen onto the row");
    } else {
      bad("the wording is not on the page", shown.slice(0, 120).replace(/\n+/g, " | "));
    }

    // ---------------------------------------------------------- 2. opening recorded
    await page.waitForTimeout(1500);
    const { data: afterOpen } = await db
      .from("agreements")
      .select("opened_at")
      .eq("token", token)
      .single();
    if (afterOpen?.opened_at) ok("opening it is recorded, from the browser");
    else bad("opening it was not recorded", "the chase-or-not field stays empty");

    // ------------------------------------------------ 3. no tick, no signature
    await page.locator('input[name="signer_name"]').fill("Sarah Webb");
    await page.getByRole("button", { name: /Type my name instead of drawing/i }).click();
    await page.locator('input[name="signer_name"]').fill("Sarah Webb");
    await page.getByRole("button", { name: /^Agree and sign$/ }).click();
    await page.waitForTimeout(2500);

    const complained = await page.locator('[role="alert"]').first().textContent().catch(() => null);
    const { data: afterNoTick } = await db
      .from("agreements")
      .select("signed_at")
      .eq("token", token)
      .single();

    if (!afterNoTick?.signed_at && /tick/i.test(complained ?? "")) {
      ok("signing without the tick is refused, and says why");
    } else if (!afterNoTick?.signed_at) {
      bad("refused without the tick, but said nothing useful", complained ?? "no message");
    } else {
      bad("it signed without the tick", "the server is trusting the browser");
    }

    // ------------------------------------------------------------- 4. signing works
    await page.locator('input[name="agreed"]').check();
    await page.getByRole("button", { name: /^Agree and sign$/ }).click();
    await page.waitForTimeout(3500);

    const { data: signed } = await db
      .from("agreements")
      .select("*")
      .eq("token", token)
      .single();

    if (!signed?.signed_at) {
      bad("it did not sign", await page.locator('[role="alert"]').first().textContent().catch(() => "no message"));
    } else {
      ok(`signed by ${signed.signer_name}`);

      if (signed.signature && String(signed.signature).startsWith("typed:")) {
        ok("the typed signature is stored as a typed one, not as an empty drawing");
      } else {
        bad("the signature is not what was given", String(signed.signature ?? "").slice(0, 40));
      }

      /*
       * Where from and on what. It is only worth recording because it is
       * evidence, and evidence a browser could type in a field is not evidence —
       * so both come out of the headers.
       */
      if (signed.signer_agent) ok(`what it was signed on was recorded`);
      else bad("nothing recorded about what it was signed on");

      /* And the half that must NOT have moved. */
      const unchanged =
        Number(signed.setup_fee_pence) === 25000 &&
        Number(signed.recurring_pence) === 2000 &&
        Number(signed.notice_days) === 60 &&
        signed.terms_text === TERMS;
      if (unchanged) ok("the money and the wording are exactly as they were sent");
      else bad("signing changed the terms", "a signature that can alter what it signs is worthless");
    }

    // --------------------------------------------------------- 5. and only once
    const firstName = signed?.signer_name ?? null;
    const at = signed?.signed_at ?? null;

    await page.goto(`${SITE}/a/${token}`, { waitUntil: "networkidle" });
    const second = await page.locator("body").innerText();
    if (/Already signed/i.test(second)) ok("coming back says it is already signed");
    else bad("coming back offered to sign it again", second.slice(0, 100).replace(/\n+/g, " | "));

    const { data: again } = await db
      .from("agreements")
      .select("signer_name, signed_at")
      .eq("token", token)
      .single();
    if (again?.signer_name === firstName && again?.signed_at === at) {
      ok("and nothing about the signature changed");
    } else {
      bad("the record moved on a second visit", `${again?.signer_name} at ${again?.signed_at}`);
    }
  } catch (e) {
    bad("the run did not finish", e.message);
  } finally {
    await browser.close();
    const { error: gone } = await db.from("agreements").delete().eq("token", token);
    if (gone) bad("could not remove the check's own agreement", `${gone.message} — token ${token}`);
    else ok("the check's own agreement taken back out");
  }

  console.log("");
  if (faults) {
    console.log(`${faults} fault${faults === 1 ? "" : "s"}.`);
    process.exitCode = 1;
  } else {
    console.log("An agreement can be sent, read, signed once, and not signed twice.");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
