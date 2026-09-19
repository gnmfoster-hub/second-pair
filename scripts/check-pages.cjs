/*
 * Every screen of every business, opened as its owner, looking for breakage.
 *
 *   node scripts/check-pages.cjs
 *
 * After a heavy day the useful question is not "does the thing I changed still
 * work" — I have already checked that — but "did any of it break something I
 * was not looking at". This opens the lot and reports anything that throws, is
 * refused, or shows a reader the words a bug leaves behind.
 *
 * Reads only. No form is submitted and no button that saves is pressed.
 */
const { chromium } = require("playwright-core");
const { signIn, SITE } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/* Words a reader should never meet. NaN and undefined are the classics. */
const BAD = /Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error|\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date/;

(async () => {
  const { data: studios, error } = await db
    .from("studios")
    .select("id, slug")
    .is("archived_at", null)
    .order("slug");
  if (error) throw new Error(error.message);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let problems = 0;
  let looked = 0;

  for (const studio of studios) {
    const { data: owner } = await db
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", studio.id)
      .eq("role", "owner")
      .limit(1);
    if (!owner?.length) {
      console.log(`${studio.slug.padEnd(26)} no owner to look as`);
      continue;
    }

    const { data: conv } = await db.from("conversations").select("id").eq("studio_id", studio.id).limit(1).maybeSingle();
    const { data: contact } = await db.from("contacts").select("id").eq("studio_id", studio.id).limit(1).maybeSingle();
    const { data: booking } = await db
      .from("bookings")
      .select("id, artists!inner(studio_id)")
      .eq("artists.studio_id", studio.id)
      .limit(1)
      .maybeSingle();

    const pages = [
      "/", "/diary", "/diary?view=week", "/diary?view=month", "/clients", "/clients/new",
      "/clients/forms", "/clients/import", "/report", "/setup", "/help",
      "/settings", "/settings/pricing", "/settings/artists", "/settings/money",
      "/settings/install", "/settings/assistant", "/settings/faqs",
      "/settings/reminders", "/settings/forms", "/settings/you", "/settings/data",
      ...(conv ? [`/conversations/${conv.id}`] : []),
      ...(contact ? [`/clients/${contact.id}`] : []),
      ...(booking ? [`/diary?entry=${booking.id}`] : []),
    ];

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await signIn(context, owner[0].user_id, "/");
    await page.waitForTimeout(1200);

    const found = [];
    for (const href of pages) {
      const errs = [];
      const onConsole = (m) => {
        if (m.type() === "error") errs.push("console: " + m.text().slice(0, 140));
      };
      const onPageError = (e) => errs.push("threw: " + String(e).slice(0, 140));
      const onResponse = (r) => {
        const u = r.url();
        if (r.status() >= 400 && u.startsWith(SITE) && !u.includes("favicon") && !u.includes("_vercel")) {
          errs.push(`${r.status()} on ${u.replace(SITE, "")}`);
        }
      };

      page.on("console", onConsole);
      page.on("pageerror", onPageError);
      page.on("response", onResponse);

      await page.goto(SITE + href, { waitUntil: "networkidle" }).catch((e) => errs.push("did not load: " + e.message.slice(0, 80)));
      await page.waitForTimeout(500);
      looked++;

      const text = await page.evaluate(() => document.body.innerText).catch(() => "");
      const bad = text.match(BAD);
      if (bad) errs.push(`shows "${bad[0]}"`);
      if (page.url().includes("/login")) errs.push("bounced to the sign-in page");

      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);

      if (errs.length) found.push(`  ${href}\n      ${errs.join("\n      ")}`);
    }

    if (found.length) {
      problems += found.length;
      console.log(`\n${studio.slug}`);
      for (const f of found) console.log(f);
    } else {
      console.log(`${studio.slug.padEnd(26)} all clear`);
    }

    await context.close();
  }

  await browser.close();
  console.log(`\n${looked} screens looked at. ${problems ? `${problems} with something wrong.` : "Nothing wrong anywhere."}`);

  /*
   * And say so in the exit code, which it never did.
   *
   * It printed the fault and exited nought, so `npm run check` ran it, read a
   * success, and reported "All 8 passed" directly underneath a screen showing
   * "undefined% of the estimate, minimum £NaN". A check that finds something
   * and then reports success is worse than one that never ran: the same
   * blindness, with a tick beside it.
   */
  process.exitCode = problems ? 1 : 0;
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
