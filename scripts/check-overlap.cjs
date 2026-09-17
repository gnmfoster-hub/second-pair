/*
 * Text sitting on top of other text, on every screen a business has.
 *
 *   node scripts/check-overlap.cjs [business-slug]
 *
 * check-edges measures against the edge of the screen and cannot see two boxes
 * landing on each other in the middle of a page — which is the other half of
 * "the boxes look all over the place", and the half Giles kept finding by eye.
 *
 * Only leaves are compared: an element with children is meant to contain them,
 * and a parent overlapping its own child is the normal state of every page
 * ever written.
 *
 * READ THE ANSWER BEFORE ACTING ON IT. This still reports things that are
 * perfectly fine, and it took three passes to get it even this close —
 * excluding sticky headers, then dialogs, then comparing line boxes rather
 * than bounding boxes, because a paragraph that wraps has a box covering the
 * empty ends of every line it occupies. What is left over still includes
 * collapsed sections and controls stacked on purpose.
 *
 * So it is a place to start looking, not a list of faults. Every one it names
 * wants a screenshot opened before a line of markup is touched: the team page
 * it flagged hardest turned out to be perfectly laid out. A checker believed
 * without looking is worse than no checker, because it sends somebody to
 * change code that was already right.
 *
 * Reads only. Signs in, looks, closes.
 */
const path = require("path");
const { chromium } = require("playwright-core");
const { signIn, SITE, OUT } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const WIDTHS = [
  ["phone", 390, 900],
  ["narrow", 480, 900],
  ["tablet", 820, 1180],
  ["laptop", 1280, 900],
];

(async () => {
  const slug = process.argv[2] ?? "willow-demo";
  const { data: s, error } = await db.from("studios").select("id").eq("slug", slug).single();
  if (error) throw new Error(error.message);
  const { data: m } = await db
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", s.id)
    .eq("role", "owner")
    .limit(1);
  if (!m?.length) throw new Error("that business has no owner to sign in as");

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
      await page.waitForTimeout(800);

      const clashes = await page.evaluate(() => {
        /* Only things that draw their own words, and only what is on screen. */
        const leaves = [...document.querySelectorAll("body *")].filter((el) => {
          if (el.children.length > 0) return false;
          const text = (el.textContent || "").trim();
          if (!text) return false;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.opacity === "0") return false;
          /*
           * Deliberate stacking is not a clash: an icon sitting on a button, a
           * label over a field, a native control laid invisibly on a pill.
           */
          /*
           * ...and neither is anything under something that floats.
           *
           * A sticky header sitting over the rows it has scrolled past is the
           * header doing its job, and a dialog covers the page on purpose.
           * Checking only the element itself reported every one of them, which
           * is how a checker ends up ignored. The whole line of ancestors has
           * to be ordinary for an overlap to mean anything.
           */
          for (let node = el; node && node !== document.body; node = node.parentElement) {
            const p = getComputedStyle(node).position;
            if (p === "absolute" || p === "fixed" || p === "sticky") return false;
          }
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 2;
        });

        /*
         * One rectangle per line of text, not one around the lot.
         *
         * A sentence that wraps over three lines has a bounding box covering
         * all three at full width — including the empty space at the end of
         * each line, where the next paragraph's first line legitimately sits.
         * Compared as boxes, every wrapped paragraph on the page overlaps its
         * neighbour and the checker reports twenty screens of nothing.
         *
         * getClientRects gives the line boxes themselves, which is what the
         * reader actually sees, and two of those in the same place is always
         * wrong.
         */
        const boxes = [];
        for (const el of leaves) {
          for (const r of el.getClientRects()) {
            if (r.width > 2 && r.height > 2) boxes.push({ el, r });
          }
        }
        const out = [];

        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;

            /* A couple of pixels of kerning is not two boxes on each other. */
            const across = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
            const down = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (across <= 3 || down <= 3) continue;

            const words = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28);
            out.push(
              `${Math.round(across)}×${Math.round(down)}px · "${words(a.el)}" over "${words(b.el)}"`,
            );
          }
        }
        return [...new Set(out)].slice(0, 3);
      });

      if (clashes.length) {
        faults++;
        console.log(`  ${name.padEnd(14)} ${clashes.join("\n                 ")}`);
        await page.screenshot({
          path: path.join(OUT, `clash-${label}-${name.replace(/\s+/g, "-")}.png`),
          fullPage: true,
        });
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(faults ? `\n${faults} screens with things drawn on top of each other.` : "\nNothing overlapping anywhere.");
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
