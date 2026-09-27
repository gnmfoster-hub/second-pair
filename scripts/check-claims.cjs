/*
 * What the "Is it working?" page tells every business, all in one place.
 *
 *   node scripts/check-claims.cjs [business-slug]
 *   SITE=https://www.second-pair.com node scripts/check-claims.cjs
 *
 * Written after Giles opened a brand new client's account and found it saying
 * the assistant was not live on her website. It was — her site carried the
 * script with her own slug on it — and the page had no way to know, because it
 * decided by counting rows in a table that is empty for everybody.
 *
 * His question was the right one: "can we check all". Every line on that
 * screen is a claim about the outside world, and a claim nothing verifies can
 * quietly become false. The ones that go wrong are never the red crosses
 * somebody is already working through. They are the greens that should be red,
 * and the reds on an account that is perfectly fine.
 *
 * This reads the real rendered page rather than re-running the assessment in
 * a script — a second copy of the logic would agree with itself and prove
 * nothing. What it prints is what the business sees.
 *
 * It cannot know which claims are wrong. It puts all of them where a person
 * can read them at once, which is the thing nobody could do before: the page
 * shows one business at a time and nobody opens ten.
 *
 * Reads only. Nothing is submitted and nothing is saved.
 */
const { chromium } = require("playwright-core");
const { signIn } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SITE = process.env.SITE ?? "http://localhost:3130";

async function reachable(url) {
  try {
    return (await fetch(url, { redirect: "manual" })).status > 0;
  } catch {
    return false;
  }
}

(async () => {
  if (!(await reachable(SITE))) {
    console.log(
      `Nothing is answering at ${SITE}.\n\nNothing has been checked. Point it somewhere real:\n` +
        "  SITE=https://www.second-pair.com node scripts/check-claims.cjs\n",
    );
    process.exitCode = 1;
    return;
  }

  const only = process.argv[2] ?? null;
  let q = db.from("studios").select("id, slug, name").is("archived_at", null).order("slug");
  if (only) q = q.eq("slug", only);

  const { data: studios, error } = await q;
  if (error) throw new Error(error.message);
  if (!studios.length) {
    console.log(only ? `No business called "${only}".` : "No businesses.");
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ channel: "chrome", headless: true });

  for (const studio of studios) {
    const { data: owner } = await db
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", studio.id)
      .eq("role", "owner")
      .limit(1);

    console.log("=".repeat(70));
    console.log(`${studio.name}  (${studio.slug})`);

    if (!owner?.length) {
      console.log("  no owner to look as");
      continue;
    }

    const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
    try {
      const page = await signIn(context, owner[0].user_id, "/");
      await page.goto(`${SITE}/settings/working`, { waitUntil: "networkidle", timeout: 40000 });
      await page.waitForTimeout(800);

      const text = (await page.locator("main").innerText()).trim();
      console.log(
        text
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n"),
      );
    } catch (e) {
      console.log(`  could not read it: ${String(e.message).slice(0, 90)}`);
    }
    await context.close();
    console.log();
  }

  await browser.close();

  console.log("=".repeat(70));
  console.log(
    "Read these against what you know to be true.\n\n" +
      "The ones worth finding are the greens that should be red, and the reds\n" +
      "on an account that is fine. Nothing here can tell you which is which —\n" +
      "that is the job this exists to make possible, not to do.",
  );
})();
