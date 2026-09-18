/*
 * Anything drawn past the edge of a phone, on every screen a business has.
 *
 * Giles found one by eye — an email address pushing the conversation page ten
 * pixels wide. Finding the rest by eye means opening twenty screens and
 * trusting a glance; measuring them takes a minute and cannot be tired.
 *
 *   node scripts/check-edges.cjs [business-slug]
 *
 * Needs the playwright helper in scripts/pw/look.cjs and the service key in
 * .env.local. Reads only: it signs in, looks, and closes.
 *
 * Reports the element, how far over it goes, and the first words in it, which
 * is nearly always enough to say which line of markup is at fault.
 */
const path = require("path");
const { chromium } = require("playwright-core");
const { signIn, SITE, OUT } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const WIDTHS = [
  ["phone", 390, 844],
  ["tablet", 820, 1180],
];

(async () => {
  const slug = process.argv[2] ?? "neat-tidy-solutions";
  const { data: s } = await db.from("studios").select("id").eq("slug", slug).single();
  const { data: m } = await db
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", s.id)
    .eq("role", "owner")
    .limit(1);

  // One of each kind of record, so the detail screens have something on them.
  const { data: conv } = await db.from("conversations").select("id").eq("studio_id", s.id).limit(1).maybeSingle();
  const { data: contact } = await db.from("contacts").select("id").eq("studio_id", s.id).limit(1).maybeSingle();

  const pages = [
    ["inbox", "/"],
    ["diary", "/diary"],
    ["clients", "/clients"],
    ["client forms", "/clients/forms"],
    ["import", "/clients/import"],
    ["reports", "/report"],
    ["settings", "/settings"],
    ["prices", "/settings/pricing"],
    ["team", "/settings/artists"],
    ["getting paid", "/settings/money"],
    ["channels", "/settings/install"],
    ["assistant", "/settings/assistant"],
    ["questions", "/settings/faqs"],
    ["reminders", "/settings/reminders"],
    ["forms", "/settings/forms"],
    ["you", "/settings/you"],
    ["your data", "/settings/data"],
    ["set-up", "/setup"],
    ...(conv ? [["conversation", `/conversations/${conv.id}`]] : []),
    ...(contact ? [["client record", `/clients/${contact.id}`]] : []),
  ];

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let faults = 0;

  for (const [label, width, height] of WIDTHS) {
    console.log(`\n───────── ${label} (${width}px) ─────────`);
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 700,
      hasTouch: true,
    });
    const page = await signIn(context, m[0].user_id, "/");
    await page.waitForTimeout(1500);

    for (const [name, href] of pages) {
      await page.goto(SITE + href, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(900);

      const over = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const seen = new Set();
        const out = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const past = Math.round(Math.max(r.right - w, -r.left));
          if (past < 2) continue;
          /*
           * A container that scrolls sideways on purpose is not a fault, and
           * neither is anything inside one however deep. This looked at the
           * element and its parent only, so a table header three levels down
           * from its own scroller was reported as broken — a wide table in a
           * scrolling box is the correct answer, not the bug.
           */
          let inScroller = false;
          for (let node = el; node && node !== document.body; node = node.parentElement) {
            const style = getComputedStyle(node);
            /*
             * Clipped counts as contained, the same as scrolled.
             *
             * A name inside a truncating line measures wider than its box and
             * is not visible past it — that is what truncate is for. Reporting
             * it sends somebody to fix a line that is already behaving.
             */
            if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) {
              inScroller = true;
              break;
            }
          }
          if (inScroller) continue;
          const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
          const key = el.tagName + text;
          if (seen.has(key) || !text) continue;
          seen.add(key);
          out.push(`${past}px · ${el.tagName.toLowerCase()} · ${text}`);
        }
        return out.slice(0, 3);
      });

      /*
       * Short labels that have wrapped onto two lines.
       *
       * A different fault from going over the edge, and invisible to the test
       * above: the text stays inside its box, the box just grows a line to
       * hold it. "enquiry only" did exactly this on every row of the customer
       * list — twenty-three rows two lines deep to say one short phrase —
       * because it sat in a fixed w-20 and two things had moved underneath it:
       * the spacing scale came down, taking every w-* with it, and secondary
       * text went up a pixel. Neither change touched that file.
       *
       * Only two or three words, and only where a width was actually set. A
       * sentence wrapping is a sentence doing its job; a fixed box holding a
       * label that no longer fits is somebody's guess having expired.
       */
      const wrapped = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        for (const el of document.querySelectorAll("body *")) {
          if (el.children.length) continue;
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (!text || text.split(" ").length > 3 || text.length > 22) continue;

          const style = getComputedStyle(el);
          if (style.whiteSpace === "nowrap" || style.whiteSpace === "pre") continue;

          // Only where somebody fixed the width. Anything free to be as wide
          // as it likes and still wrapping is being squeezed by a real layout.
          if (style.width === "auto" || style.width.includes("%")) continue;

          /*
           * Ask the text itself how many lines it is on.
           *
           * The first try compared the element's height against its
           * line-height, and reported thirty-eight buttons — a button is
           * taller than one line because it has padding, not because anything
           * wrapped. Tuning that threshold would only have moved the guess.
           *
           * A Range over the text gives one rectangle per line box, which is
           * the actual question and has no threshold in it at all.
           */
          const range = document.createRange();
          range.selectNodeContents(el);
          const lines = range.getClientRects().length;
          if (lines < 2) continue;

          if (seen.has(text)) continue;
          seen.add(text);
          const r = el.getBoundingClientRect();
          out.push(`on ${lines} lines in ${Math.round(r.width)}px · "${text}"`);
        }
        return out.slice(0, 3);
      });

      const all = [...over, ...wrapped];
      if (all.length) {
        faults++;
        console.log(`  ${name.padEnd(14)} ${all.join("\n                 ")}`);
        await page.screenshot({ path: path.join(OUT, `edge-${label}-${name.replace(/\s+/g, "-")}.png`) });
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(
    faults
      ? `\n${faults} screens with text over an edge or wrapped in a box too small for it.`
      : "\nNothing over the edge, and no label wrapped in a box too small for it.",
  );
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
