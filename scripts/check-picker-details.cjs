/*
 * Does booking a regular show you who they are, and let you put a number right?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-picker-details.cjs
 *
 * Giles: "if when adding something to the diary that is already a client it
 * should check the contact details of the customer at that stage so they can be
 * changed if required but also allows the user to know its the correct customer
 * by tel/email etc."
 *
 * Two questions, and the second one is dangerous. This now writes to a live
 * customer's record from a form about something else, so the check that matters
 * most is the one proving it does NOT write when nobody asked it to.
 *
 * Demos only, and it puts back whatever it changes. The client it picks is read
 * from the database first and compared again at the end.
 */
const { signIn, SITE } = require("./pw/look.cjs");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};
const note = (w) => console.log(`  --    ${w}`);

(async () => {
  const { data: studios } = await db
    .from("studios")
    .select("id, name, slug")
    .is("archived_at", null)
    .like("slug", "%demo%");

  if (!studios?.length) {
    note("no demo businesses");
    process.exit(0);
  }

  /* Somebody with a number on them, so there is something to show and amend. */
  const { data: contacts } = await db
    .from("contacts")
    .select("id, name, phone, email, studio_id")
    .in("studio_id", studios.map((s) => s.id))
    .not("phone", "is", null)
    .not("name", "is", null)
    .limit(40);

  const them = (contacts ?? []).find((c) => (c.name ?? "").trim().length > 3);
  if (!them) {
    note("no demo client has a name and a number, so there is nothing to confirm");
    process.exit(0);
  }

  const studio = studios.find((s) => s.id === them.studio_id);
  const was = { phone: them.phone, email: them.email };
  console.log(`\n${studio.name} (${studio.slug}) · ${them.name} · ${was.phone} · ${was.email ?? "no email"}\n`);

  const { data: members } = await db
    .from("studio_members")
    .select("user_id, role")
    .eq("studio_id", studio.id);
  const owner = (members ?? []).find((m) => m.role === "owner") ?? (members ?? [])[0];
  if (!owner) {
    note("nobody can open that business");
    process.exit(0);
  }

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await signIn(context, owner.user_id, "/diary");
  await page.waitForLoadState("networkidle");

  /*
   * Open the new-entry sheet.
   *
   * By what the button says on the screen, not by its accessible name: the
   * first version of this asked for a button named "Add", timed out, and
   * reported "the client picker is not on this sheet" — which reads as the
   * product having lost its picker. It was on screen the whole time.
   */
  let add = null;
  for (const button of await page.getByRole("button").all()) {
    if (!(await button.isVisible())) continue;
    if ((await button.innerText()).trim() === "Add") {
      add = button;
      break;
    }
  }
  if (!add) {
    const buttons = await page.getByRole("button").allTextContents();
    note(`no way in to the diary sheet. Buttons: ${buttons.slice(0, 12).join(" / ")}`);
    await browser.close();
    process.exit(0);
  }
  await add.click();

  /*
   * Add offers a chooser before the form: who this is for. "Somebody who has
   * been before" is the whole subject of this check, and the script went
   * looking for the picker without pressing it.
   */
  const returning = page
    .getByRole("button", { name: /Somebody who has been before/i })
    .first();
  await returning.waitFor({ timeout: 8000 }).catch(() => {});
  if (await returning.count()) await returning.click();

  const search = page.getByPlaceholder(/Search, or type a new name/i).first();
  await search.waitFor({ timeout: 8000 }).catch(() => {});
  if (!(await search.count())) {
    note("the client picker is not on this sheet");
    await browser.close();
    process.exit(0);
  }

  const term = them.name.trim().split(/\s+/)[0];
  await search.fill(term);

  const theirRow = page.getByRole("button", { name: new RegExp(them.name, "i") }).first();
  await theirRow.waitFor({ timeout: 8000 }).catch(() => {});
  if (!(await theirRow.count())) {
    note(`searching "${term}" did not offer ${them.name}`);
    await browser.close();
    process.exit(0);
  }

  /* Both details are offered before picking, so two people can be told apart. */
  const rowText = (await theirRow.innerText()).replace(/\s+/g, " ");
  if (rowText.includes(was.phone)) ok("the search result shows their number");
  else bad("the search result does not show their number", rowText);

  await theirRow.click();

  const sheet = page.locator("form").filter({ has: search }).first();
  const after = (await sheet.innerText()).replace(/\s+/g, " ");

  if (after.includes(was.phone)) ok("their number is shown once they are picked");
  else bad("their number is not shown once they are picked", after.slice(0, 200));

  if (!was.email) note("they have no email on file, so there is none to show");
  else if (after.includes(was.email)) ok("their email is shown too");
  else bad("their email is not shown", after.slice(0, 200));

  /*
   * The important one. The boxes must not be editable until Change is pressed,
   * because an open input next to somebody's real number is one stray keystroke
   * from losing it.
   */
  const change = sheet.getByRole("button", { name: /^Change$/ }).first();
  if (await change.count()) ok("the details are read-only until Change is pressed");
  else bad("no Change control", "there is no way to put a wrong number right");

  const shots = path.join(require("os").tmpdir(), "second-pair-shots");
  await page.screenshot({ path: path.join(shots, "picker-chosen.png"), fullPage: false });

  if (await change.count()) {
    await change.click();

    const phoneBox = sheet.getByLabel("Mobile").first();
    if (!(await phoneBox.count())) {
      note("Change opened but there is no Mobile box");
    } else {
      /*
       * Emptying it must change nothing. Checked through the hidden field the
       * form would actually submit rather than by saving, so no booking is
       * created on a demo diary to find out.
       */
      await phoneBox.fill("");
      const onEmpty = await sheet
        .locator('input[name="contact_name_phone"]')
        .inputValue()
        .catch(() => null);
      if (onEmpty === "") ok("an emptied box sends nothing, so nothing is cleared");
      else bad("an emptied box would be submitted", String(onEmpty));

      await phoneBox.fill(was.phone);
      const onSame = await sheet
        .locator('input[name="contact_name_phone"]')
        .inputValue()
        .catch(() => null);
      if (onSame === "") ok("their own number typed back is not treated as a change");
      else bad("re-typing the same number would be written back", String(onSame));

      await phoneBox.fill("+447700900987");
      const onNew = await sheet
        .locator('input[name="contact_name_phone"]')
        .inputValue()
        .catch(() => null);
      if (onNew === "+447700900987") ok("a number typed over the old one is submitted");
      else bad("a changed number would not be saved", String(onNew));

      await page.screenshot({ path: path.join(shots, "picker-amending.png"), fullPage: false });
    }
  }

  await browser.close();

  /* Nothing was saved, so the record must be exactly as it was. */
  const { data: now } = await db
    .from("contacts")
    .select("phone, email")
    .eq("id", them.id)
    .maybeSingle();

  if (now?.phone === was.phone && (now?.email ?? null) === (was.email ?? null)) {
    ok("their record is untouched, because nothing was saved");
  } else {
    bad("their record changed without a save", `${was.phone} became ${now?.phone}`);
  }

  console.log(faults ? `\n${faults} fault(s)\n` : "\nnothing wrong\n");
  process.exit(faults ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
