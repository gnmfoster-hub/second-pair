/*
 * Is a customer record still three screenfuls of reminders?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-record-length.cjs
 *
 * Giles, 1 October: "history and planned reminders etc in customer record need
 * to collapse somehow or be in a more structured way, they take up too much of
 * the page."
 *
 * The complaint is about length, so the check measures length. Everything else
 * about this page could be right and it would still be the wrong page if the
 * history runs past the bottom of the screen.
 *
 * It also measures the thing that would make shortening it a lie: the bodies
 * of the messages are now behind two folds, and a fold that cannot be opened
 * has deleted somebody's records rather than tidied them.
 *
 * ── Demos only ──────────────────────────────────────────────────────────────
 *
 * Signing into a live business to look at a screen is not free: it is somebody
 * else's customer's name and medical notes on my terminal. A check that opened
 * Living Canvas by accident nearly sent one of their agreements out in
 * September. So the studio is chosen from the demos by slug and the choice is
 * printed, and the script refuses to go anywhere if the list is empty.
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
/* Not a fault. This script could not reach the thing it wanted to look at. */
const note = (w) => console.log(`  --    ${w}`);

(async () => {
  const { data: studios, error: se } = await db
    .from("studios")
    .select("id, name, slug")
    .is("archived_at", null)
    .like("slug", "%demo%");
  if (se) throw new Error(se.message);
  if (!studios?.length) {
    note("no demo businesses to look at");
    process.exit(0);
  }

  const ids = studios.map((s) => s.id);

  /*
   * The client with the most reminders, because that is the worst case and the
   * worst case is what Giles was looking at. A client with one visit was never
   * the problem.
   */
  const { data: contacts, error: ce } = await db
    .from("contacts")
    .select("id, name, studio_id")
    .in("studio_id", ids);
  if (ce) throw new Error(ce.message);

  /*
   * A booking has no studio_id — it reaches a business through the customer, the
   * artist or the enquiry — so they are found by customer. That also means a
   * booking attached to an enquiry and no contact row is not counted here, which
   * only affects which client this picks as the worst case.
   */
  const { data: bookings, error: be } = await db
    .from("bookings")
    .select("id, contact_id")
    .in(
      "contact_id",
      (contacts ?? []).map((c) => c.id),
    );
  if (be) throw new Error(be.message);

  /*
   * A hundred at a time. PostgREST takes the id list in the query string and a
   * few hundred uuids is a URL long enough that node's fetch gives up — and it
   * gives up as a bare "fetch failed", which reads like the database being down
   * rather than me asking for too much at once.
   */
  const bookingIds = (bookings ?? []).map((b) => b.id);
  const reminders = [];
  for (let i = 0; i < bookingIds.length; i += 100) {
    const { data, error: re } = await db
      .from("reminders")
      .select("id, booking_id, body")
      .in("booking_id", bookingIds.slice(i, i + 100));
    if (re) throw new Error(re.message);
    reminders.push(...(data ?? []));
  }

  const perBooking = new Map();
  for (const r of reminders ?? []) {
    perBooking.set(r.booking_id, (perBooking.get(r.booking_id) ?? 0) + 1);
  }

  const score = new Map();
  for (const b of bookings ?? []) {
    if (!b.contact_id) continue;
    const was = score.get(b.contact_id) ?? { bookings: 0, messages: 0 };
    was.bookings += 1;
    was.messages += perBooking.get(b.id) ?? 0;
    score.set(b.contact_id, was);
  }

  let pick = null;
  for (const [contactId, s] of score) {
    const c = (contacts ?? []).find((x) => x.id === contactId);
    if (!c) continue;
    const total = s.bookings + s.messages;
    if (!pick || total > pick.total) pick = { c, ...s, total };
  }

  if (!pick) {
    note("no demo client has a booking, so there is no record to measure");
    process.exit(0);
  }

  const studio = studios.find((s) => s.id === pick.c.studio_id);
  console.log(
    `\n${studio.name} (${studio.slug}) · ${pick.c.name} · ${pick.bookings} bookings, ${pick.messages} messages\n`,
  );

  /* Somebody who can open that business. */
  const { data: members, error: me } = await db
    .from("studio_members")
    .select("user_id, role")
    .eq("studio_id", studio.id);
  if (me) throw new Error(me.message);
  const owner = (members ?? []).find((m) => m.role === "owner") ?? (members ?? [])[0];
  if (!owner) {
    note("nobody is a member of that business, so there is no way in");
    process.exit(0);
  }

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await signIn(context, owner.user_id, `/clients/${pick.c.id}`);
  await page.waitForLoadState("networkidle");

  /*
   * The history section, found by its heading rather than by a class, because a
   * class is a thing I wrote this morning and a heading is the thing on the
   * screen.
   */
  const heading = page
    .locator("h2, h3")
    .filter({ hasText: /^(History|Everything|Visits|Timeline)/i })
    .first();

  if (!(await heading.count())) {
    const headings = await page.locator("h2, h3").allTextContents();
    note(`could not find the history heading. The page has: ${headings.join(" / ")}`);
    await browser.close();
    process.exit(0);
  }

  const section = heading.locator("xpath=..");

  const tall = await section.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const whole = await page.evaluate(() => Math.round(document.body.scrollHeight));
  console.log(`  the history block is ${tall}px of a ${whole}px page`);

  if (tall <= 900) ok(`the history fits one screen (${tall}px)`);
  else if (tall <= 1600) note(`the history is ${tall}px, a screen and a bit`);
  else bad("the history is still screenfuls", `${tall}px`);

  if (tall / whole <= 0.5) ok(`it is ${Math.round((100 * tall) / whole)}% of the page`);
  else bad("the history is most of the page", `${Math.round((100 * tall) / whole)}%`);

  /* How many entries are on the screen before anybody clicks anything. */
  const topRows = section.locator("> ol > li");
  console.log(`  ${await topRows.count()} entries are open to start with`);

  /*
   * Nothing lost. Every reminder body in the database for this client should be
   * reachable on this page, so open everything that opens and count them.
   */
  const bodies = new Set(
    (reminders ?? [])
      .filter((r) => r.body && (bookings ?? []).some((b) => b.id === r.booking_id && b.contact_id === pick.c.id))
      .map((r) => r.body.trim().slice(0, 60)),
  );

  /*
   * The picture that matters is this one: the page as it arrives, before
   * anybody has clicked anything. The one with everything opened proves nothing
   * was lost; this one is the thing Giles complained about.
   */
  const shots = path.join(require("os").tmpdir(), "second-pair-shots");
  await page.screenshot({ path: path.join(shots, "customer-record-closed.png"), fullPage: true });

  const earlier = section.locator("summary", { hasText: /^Show \d+ earlier/ });
  if (await earlier.count()) {
    await earlier.first().click();
    ok("the earlier entries open");
  } else {
    note("no earlier fold on this record, so everything was already open");
  }

  /* Every fold, outermost first, until none are shut. */
  for (let round = 0; round < 6; round++) {
    const shut = section.locator("details:not([open]) > summary");
    const howMany = await shut.count();
    if (!howMany) break;
    for (let i = 0; i < howMany; i++) {
      try {
        await shut.nth(i).click({ timeout: 2000 });
      } catch {
        /* Moved under us as a parent opened. The next round catches it. */
      }
    }
  }

  const text = (await section.innerText()).replace(/\s+/g, " ");
  const missing = [...bodies].filter((b) => !text.includes(b.replace(/\s+/g, " ")));

  if (bodies.size === 0) note("this client has no message wording recorded to check");
  else if (missing.length === 0) ok(`all ${bodies.size} message wordings are reachable`);
  else bad(`${missing.length} of ${bodies.size} wordings cannot be reached`, missing[0]);

  const open = await section.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  console.log(`  opened right out it is ${open}px, so the fold saves ${open - tall}px`);
  if (open > tall) ok("the folds are actually hiding something");
  else bad("opening everything changed nothing", "the folds may not be wired up");

  const shot = path.join(shots, "customer-record-open.png");
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\n  picture: ${shot}`);

  await browser.close();
  console.log(faults ? `\n${faults} fault(s)\n` : "\nnothing wrong\n");
  process.exit(faults ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
