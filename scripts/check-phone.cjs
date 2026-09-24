/*
 * Every screen of every business at phone width, looking for squeezed text.
 *
 *   node scripts/check-phone.cjs [business-slug]
 *
 * Written after Giles found the readiness row on his own client's inbox 717
 * pixels tall with one word on each line. The row was a wrapping flex whose
 * text could shrink to nothing while the button beside it could not — so on a
 * 390px screen the words went down the page one at a time.
 *
 * The part worth automating is not that bug. It is that Willow, where I test,
 * was completely fine: the fault only appeared where that particular check was
 * the live one and its sentence was long enough. I found it by opening all
 * nine businesses by hand. This does that.
 *
 * What it looks for is the signature rather than the cause: a block of text
 * rendered far taller than it is wide. A paragraph forty pixels across and
 * three hundred tall is not a layout anybody chose.
 *
 * Reads only. Nothing is submitted and nothing is saved.
 */
const { chromium } = require("playwright-core");
const { signIn } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const WIDTH = 390;

/*
 * A phone screen, and the shape of a squeeze.
 *
 * Narrower than this and taller than that, with real words in it. The numbers
 * are deliberately generous: one word per line at a readable size is about 100
 * pixels wide, and anything doing that for 140 pixels of height has wrapped at
 * least four times. Tighter thresholds find poetry and bullet lists.
 */
const NARROW = 110;
const TALL = 140;

(async () => {
  const only = process.argv[2] ?? null;

  let query = db.from("studios").select("id, slug").is("archived_at", null).order("slug");
  if (only) query = query.eq("slug", only);

  const { data: studios, error } = await query;
  if (error) throw new Error(error.message);

  if (only && !studios.length) {
    console.log(`No business called "${only}". Nothing was checked.`);
    process.exitCode = 1;
    return;
  }

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

    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("studio_id", studio.id)
      .limit(1)
      .maybeSingle();

    const pages = [
      "/", "/diary", "/clients", "/report", "/help",
      "/settings", "/settings/working", "/settings/install", "/settings/reminders",
      "/settings/artists", "/settings/pricing", "/settings/money", "/settings/you",
      ...(contact ? [`/clients/${contact.id}`] : []),
    ];

    const context = await browser.newContext({
      viewport: { width: WIDTH, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await signIn(context, owner[0].user_id, "/");
    await page.waitForTimeout(1200);

    const found = [];
    for (const href of pages) {
      looked++;
      try {
        await page.goto(`${process.env.SITE ?? "http://localhost:3130"}${href}`, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
      } catch {
        found.push(`${href}\n      did not load`);
        continue;
      }

      const squeezed = await page.evaluate(
        ([narrow, tall]) => {
          const out = [];
          for (const el of document.querySelectorAll("p, span, div, li, td, h1, h2, h3, a, button, label")) {
            /* Only the leaf that actually holds the words. */
            if (el.children.length > 0) continue;

            const text = (el.textContent ?? "").trim();
            if (text.length < 12) continue;

            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.width < narrow && r.height > tall) {
              out.push(`${Math.round(r.width)}x${Math.round(r.height)} "${text.slice(0, 50)}"`);
            }
          }
          return out.slice(0, 4);
        },
        [NARROW, TALL],
      );

      /* And anything pushing the page sideways, which is the other phone fault. */
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );

      if (squeezed.length) found.push(`${href}\n      ${squeezed.join("\n      ")}`);
      if (sideways) found.push(`${href}\n      the page scrolls sideways`);
    }

    await context.close();

    if (found.length) {
      problems += found.length;
      console.log(`\n${studio.slug}`);
      for (const f of found) console.log(`  ${f}`);
    } else {
      console.log(`${studio.slug.padEnd(26)} all clear`);
    }
  }

  await browser.close();

  console.log(
    `\n${looked} screens at ${WIDTH}px. ${problems === 0 ? "Nothing squeezed." : `${problems} with something squeezed.`}`,
  );
  if (problems) process.exitCode = 1;
})();
