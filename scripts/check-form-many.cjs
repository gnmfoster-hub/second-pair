/*
 * Three dogs on one form, and three sets of answers on the record.
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-form-many.cjs
 *
 * Giles picked "one form, add as many dogs as you have" over one form per dog.
 * The risk in that choice is quiet: three dogs writing to one breed leaves
 * whichever was saved last, and the other two are gone with nothing to show it
 * happened. So this presses the button twice, fills all three in differently,
 * and reads the record back.
 *
 * Demos only. Everything written is removed and the client's details are put
 * back as they were found.
 */
const path = require("path");
const { SITE } = require("./pw/look.cjs");
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { randomBytes } = require("crypto");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};
const note = (w) => console.log(`  --    ${w}`);

const mess = { formId: null, contactId: null, was: null };
async function tidyUp() {
  if (mess.formId) await db.from("client_forms").delete().eq("id", mess.formId);
  if (mess.contactId && mess.was) await db.from("contacts").update(mess.was).eq("id", mess.contactId);
  console.log("\n  tidied");
}

const BLOCKS = [
  { id: "own", type: "short", label: "Your name", required: true, role: "name" },
  {
    id: "dog",
    type: "repeat",
    label: "Your dog",
    each: "Dog",
    addLabel: "Add another dog",
    children: [
      { id: "dn", type: "short", label: "Name", required: true },
      { id: "db", type: "short", label: "Breed", required: true, role: "fact:breed" },
      { id: "dw", type: "yesno", label: "Anything to watch for", detailOnYes: true, required: true, role: "alert" },
    ],
  },
  { id: "sign", type: "signature", label: "Signature", required: true },
];

(async () => {
  const { data: studio } = await db
    .from("studios")
    .select("id, name")
    .eq("slug", "willow-demo")
    .maybeSingle();
  const { data: person } = await db
    .from("contacts")
    .select("id, name, alert, trade_facts")
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
  mess.was = { alert: person.alert, trade_facts: person.trade_facts };

  console.log(`\n${studio.name} · ${person.name}\n`);

  try {
    await db.from("contacts").update({ alert: null, trade_facts: {} }).eq("id", person.id);

    const token = randomBytes(24).toString("base64url");
    const { data: made, error } = await db
      .from("client_forms")
      .insert({
        studio_id: studio.id,
        contact_id: person.id,
        title: "Three dogs check",
        blocks: BLOCKS,
        status: "sent",
        token,
        sent_via: "link",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    mess.formId = made.id;

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
    await page.goto(`${SITE}/f/${token}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    const boxes = () => page.locator('input[name^="q_dn"]').count();
    if ((await boxes()) === 1) ok("it opens asking about one dog");
    else bad(`it opens with ${await boxes()} dogs`, "one is the right number to start with");

    const add = page.getByRole("button", { name: /add another dog/i }).first();
    if (!(await add.count())) {
      bad("there is no way to add another dog");
    } else {
      await add.click();
      await add.click();
      await page.waitForTimeout(400);
      if ((await boxes()) === 3) ok("pressing it twice gives three");
      else bad(`pressing it twice gave ${await boxes()}`, "three expected");

      /* And taking one off again. */
      const remove = page.getByRole("button", { name: /remove the last dog/i }).first();
      if (await remove.count()) {
        await remove.click();
        await page.waitForTimeout(300);
        if ((await boxes()) === 2) ok("and the last one can be taken off again");
        else bad("removing did not take one off");
        await add.click();
        await page.waitForTimeout(300);
      } else {
        note("no remove button once there is more than one");
      }

      /* Each dog says which one it is. */
      const said = (await page.locator("form").innerText()).replace(/\s+/g, " ");
      if (/Dog 1/.test(said) && /Dog 3/.test(said)) ok("each one is numbered on the page");
      else bad("the dogs are not numbered", said.slice(0, 120));
    }

    /* Fill all three in differently. */
    await page.fill('[name="q_own"]', "Marie Whitlock");
    await page.fill('[name="q_dn"]', "Bramble");
    await page.fill('[name="q_db"]', "Collie");
    await page.locator('input[name="q_dw"][value="no"]').check({ force: true });

    await page.fill('[name="q_dn~2"]', "Pip");
    await page.fill('[name="q_db~2"]', "Spaniel");
    await page.locator('input[name="q_dw~2"][value="yes"]').check({ force: true });
    await page.waitForTimeout(250);
    await page.fill('[name="q_dw~2__detail"]', "Bites strangers");

    await page.fill('[name="q_dn~3"]', "Nell");
    await page.fill('[name="q_db~3"]', "Terrier");
    await page.locator('input[name="q_dw~3"][value="no"]').check({ force: true });

    const typeIt = page.getByRole("button", { name: /type my name/i }).first();
    if (await typeIt.count()) await typeIt.click({ force: true });
    await page.fill('[name="signer_name"]', "Marie Whitlock");
    await page.waitForTimeout(250);

    await page.getByRole("button", { name: /submit/i }).first().click({ force: true });
    await page.waitForTimeout(4500);

    const done = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    if (/thank you/i.test(done)) ok("it accepts a form filled in for three");
    else bad("it did not submit", done.slice(0, 140));

    await page.screenshot({
      path: path.join(require("os").tmpdir(), "second-pair-shots", "three-dogs.png"),
      fullPage: true,
    });
    await browser.close();

    /* ------------------------------------------------- did all three land? */
    const { data: after } = await db
      .from("contacts")
      .select("name, alert, trade_facts")
      .eq("id", person.id)
      .maybeSingle();

    const facts = after.trade_facts ?? {};
    if (facts.breed === "Collie" && facts.breed_2 === "Spaniel" && facts.breed_3 === "Terrier") {
      ok("all three breeds are on the record, kept apart");
    } else {
      bad("the breeds did not all land", JSON.stringify(facts));
    }

    if ((after.alert ?? "").includes("Bites strangers")) ok("the one that bites raised an alert");
    else bad("the alert did not land", `alert is "${after.alert}"`);

    if (!/Dog 1|Dog 3/.test(after.alert ?? "")) ok("and the two that are fine raised nothing");
    else bad("a dog that is fine raised an alert", after.alert);

    if (/Dog 2/.test(after.alert ?? "")) ok("the alert says which dog it is about");
    else bad("the alert does not say which dog", `alert is "${after.alert}"`);

    /* And the record reads back as three. */
    const { data: back } = await db
      .from("client_forms")
      .select("answers")
      .eq("id", mess.formId)
      .maybeSingle();
    if (back?.answers?.__n_dog === "3") ok("the form remembers it was filled in for three");
    else bad("the count was not kept", JSON.stringify(back?.answers?.__n_dog));
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
