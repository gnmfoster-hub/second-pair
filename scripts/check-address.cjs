/*
 * Is there anywhere to put a customer's address, and does it stick?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-address.cjs
 *
 * Giles, 5 October: "we havent got the address in the client area, this needs to
 * be there for everything and have the option to add when making a booking not
 * mandatory and write back from forms."
 *
 * Three places, and the third already worked:
 *
 *   1. the client record, where it can be typed and saved
 *   2. the diary, offered while booking and never required
 *   3. a form, which fills it in and writes it back
 *
 * Demos only. The client's details are put back exactly as found.
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
const note = (w) => console.log(`  --    ${w}`);

const mess = { contactId: null, was: null };
async function tidyUp() {
  if (mess.contactId && mess.was) await db.from("contacts").update(mess.was).eq("id", mess.contactId);
  console.log("\n  tidied: the client's details put back");
}

(async () => {
  const { data: studio } = await db
    .from("studios")
    .select("id, name")
    .eq("slug", "willow-demo")
    .maybeSingle();

  const { data: person } = await db
    .from("contacts")
    .select("id, name, address, postcode")
    .eq("studio_id", studio.id)
    .not("name", "is", null)
    .order("name")
    .limit(1)
    .maybeSingle();

  if (!person) {
    note("no demo client");
    process.exit(0);
  }

  mess.contactId = person.id;
  mess.was = { address: person.address, postcode: person.postcode };

  console.log(`\n${studio.name} · ${person.name}\n`);

  try {
    await db.from("contacts").update({ address: null, postcode: null }).eq("id", person.id);

    const { data: members } = await db
      .from("studio_members")
      .select("user_id, role")
      .eq("studio_id", studio.id);
    const owner = (members ?? []).find((m) => m.role === "owner") ?? (members ?? [])[0];

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });

    /* ------------------------------------------- 1. on the client record */
    const page = await signIn(context, owner.user_id, `/clients/${person.id}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(900);

    const addr = page.locator('textarea[name="address"]').first();
    const post = page.locator('input[name="postcode"]').first();

    if ((await addr.count()) && (await post.count())) ok("the client record has an address and a postcode");
    else bad("no address on the client record", `address ${await addr.count()}, postcode ${await post.count()}`);

    if (await addr.count()) {
      await addr.fill("2 Union Street, Newton Abbot");
      await post.fill("TQ12 2JS");
      await page.getByRole("button", { name: /^Save$/ }).first().click({ force: true });
      await page.waitForTimeout(3000);

      const { data: saved } = await db
        .from("contacts")
        .select("address, postcode")
        .eq("id", person.id)
        .maybeSingle();

      if (saved.address === "2 Union Street, Newton Abbot" && saved.postcode === "TQ12 2JS") {
        ok("and typing one in saves it");
      } else {
        bad("the address did not save", JSON.stringify(saved));
      }

      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const shown = await page.locator('textarea[name="address"]').first().inputValue();
      if (shown === "2 Union Street, Newton Abbot") ok("and it is still there when the page is opened again");
      else bad("the saved address is not shown back", `box has "${shown}"`);
    }

    /* ----------------------------------------------- 2. while booking */
    await page.goto(`${SITE}/diary`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    let add = null;
    for (const b of await page.getByRole("button").all()) {
      if ((await b.isVisible()) && (await b.innerText()).trim() === "Add") {
        add = b;
        break;
      }
    }
    if (!add) {
      note("no Add button on the diary");
    } else {
      await add.click();
      const returning = page.getByRole("button", { name: /Somebody who has been before/i }).first();
      await returning.waitFor({ timeout: 8000 }).catch(() => {});
      if (await returning.count()) await returning.click();

      const search = page.getByPlaceholder(/Search, or type a new name/i).first();
      await search.waitFor({ timeout: 8000 }).catch(() => {});
      await search.fill(person.name.trim().split(/\s+/)[0]);

      const row = page.getByRole("button", { name: new RegExp(person.name, "i") }).first();
      await row.waitFor({ timeout: 8000 }).catch(() => {});
      if (!(await row.count())) {
        note("the search did not offer them");
      } else {
        await row.click();
        await page.waitForTimeout(600);
        const sheet = page.locator("form").filter({ has: search }).first();
        const says = (await sheet.innerText()).replace(/\s+/g, " ");

        if (says.includes("2 Union Street")) ok("booking them shows the address you hold");
        else bad("the address is not shown while booking", says.slice(0, 140));

        /* And it can be added, without being required. */
        const change = page.getByRole("button", { name: "Change", exact: true }).first();
        if (await change.count()) {
          await change.click({ force: true });
          await page.waitForTimeout(600);
          const box = sheet.locator('textarea[name$="_address"], textarea').filter({ hasNot: page.locator("[name='notes']") });
          const addressBox = sheet.getByLabel("Address").first();
          if (await addressBox.count()) ok("and there is a box to put one in");
          else bad("no address box while booking", `${await box.count()} textareas`);

          const required = await sheet
            .locator('textarea[name="contact_name_address"], input[name="contact_name_postcode"]')
            .evaluateAll((els) => els.some((e) => e.required));
          if (!required) ok("and it is not required");
          else bad("the address is required when booking", "it should never be");
        } else {
          note("no Change control on the picker");
        }
      }
    }

    await page.screenshot({
      path: path.join(require("os").tmpdir(), "second-pair-shots", "address.png"),
      fullPage: false,
    });
    await browser.close();
  } finally {
    await tidyUp();
  }

  console.log(faults ? `\n${faults} fault(s)\n` : "\nnothing wrong\n");
  process.exit(faults ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await tidyUp();
  process.exit(1);
});
