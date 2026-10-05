/*
 * Does a form fill itself in, and does what the customer types reach the record?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-form-roundtrip.cjs
 *
 * The whole point of the 5 October work, proved the only way worth believing:
 * a form really sent to a real client on a demo, opened in a browser the way a
 * customer opens it, filled in and signed, and then the client record read back
 * out of the database.
 *
 * Four things, and the last two are the ones that have never existed:
 *
 *   1. what we already hold arrives in the boxes
 *   2. a signature is required and the form refuses without it
 *   3. the answers reach the client record, in the right places
 *   4. an answer left blank does not wipe what was there
 *
 * Demos only, chosen by slug and printed. Every row it writes is removed at the
 * end, including the contact's details, which are put back exactly as found.
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

const mess = { templateId: null, formId: null, contactId: null, was: null };

async function tidyUp() {
  if (mess.formId) await db.from("client_forms").delete().eq("id", mess.formId);
  if (mess.templateId) await db.from("form_templates").delete().eq("id", mess.templateId);
  if (mess.contactId && mess.was) {
    await db.from("contacts").update(mess.was).eq("id", mess.contactId);
  }
  console.log(`\n  tidied: form, template, and the client's details put back`);
}

/* A small form that exercises every kind of role. */
const BLOCKS = [
  { id: "t", type: "text", label: "A check, not a real form." },
  { id: "n", type: "short", label: "Your name", required: true, role: "name" },
  { id: "p", type: "short", label: "Mobile", required: true, role: "phone" },
  { id: "e", type: "short", label: "Email", required: true, role: "email" },
  { id: "ad", type: "long", label: "Address", role: "address" },
  { id: "pc", type: "short", label: "Postcode", role: "postcode" },
  { id: "br", type: "short", label: "Breed", role: "fact:breed" },
  { id: "vx", type: "date", label: "Vaccinations run out", required: true, role: "fact:vaccination_due" },
  { id: "al", type: "yesno", label: "Anything to watch for", detailOnYes: true, required: true, role: "alert" },
  { id: "sk", type: "short", label: "Left blank on purpose", role: "note" },
  { id: "sign", type: "signature", label: "Signature", required: true },
];

(async () => {
  const { data: studio } = await db
    .from("studios")
    .select("id, name, slug")
    .eq("slug", "willow-demo")
    .maybeSingle();
  if (!studio) {
    note("willow-demo is not there");
    process.exit(0);
  }

  const { data: person } = await db
    .from("contacts")
    .select("id, name, phone, email, address, postcode, alert, notes, trade_facts")
    .eq("studio_id", studio.id)
    .not("phone", "is", null)
    .not("name", "is", null)
    .order("name")
    .limit(1)
    .maybeSingle();

  if (!person) {
    note("no demo client to send to");
    process.exit(0);
  }

  mess.contactId = person.id;
  mess.was = {
    name: person.name,
    phone: person.phone,
    email: person.email,
    address: person.address,
    postcode: person.postcode,
    alert: person.alert,
    notes: person.notes,
    trade_facts: person.trade_facts,
  };

  console.log(`\n${studio.name} · ${person.name}\n`);

  try {
    /* Give them something to be prefilled from, and something to protect. */
    await db
      .from("contacts")
      .update({ notes: "Do not lose me", trade_facts: { breed: "Collie" } })
      .eq("id", person.id);

    const { data: tpl, error: te } = await db
      .from("form_templates")
      .insert({ studio_id: studio.id, name: "Round trip check", kind: "questionnaire", blocks: BLOCKS, active: true })
      .select("id")
      .single();
    if (te) throw new Error(te.message);
    mess.templateId = tpl.id;

    const token = require("crypto").randomBytes(24).toString("base64url");
    const { data: sent, error: fe } = await db
      .from("client_forms")
      .insert({
        studio_id: studio.id,
        contact_id: person.id,
        template_id: tpl.id,
        title: "Round trip check",
        blocks: BLOCKS,
        status: "sent",
        token,
        sent_via: "link",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (fe) throw new Error(fe.message);
    mess.formId = sent.id;

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${SITE}/f/${token}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    /* -------------------------------------------------- 1. it arrives filled in */
    const inBoxes = await page.evaluate(() => ({
      name: document.querySelector('[name="q_n"]')?.value ?? null,
      phone: document.querySelector('[name="q_p"]')?.value ?? null,
      breed: document.querySelector('[name="q_br"]')?.value ?? null,
      email: document.querySelector('[name="q_e"]')?.value ?? null,
    }));

    if (inBoxes.name === person.name) ok("their name is already in the box");
    else bad("the name was not prefilled", `box had "${inBoxes.name}"`);

    if (inBoxes.phone === person.phone) ok("so is their number");
    else bad("the number was not prefilled", `box had "${inBoxes.phone}"`);

    if (inBoxes.breed === "Collie") ok("and a trade fact we already held");
    else bad("the breed fact was not prefilled", `box had "${inBoxes.breed}"`);

    /* ------------------------------------------- 2. it refuses without a signature */
    await page.getByRole("button", { name: /submit|send|done/i }).first().click({ force: true });
    await page.waitForTimeout(1200);
    const complained = await page.locator('[role="alert"]').count();
    if (complained) ok("it refuses to submit unsigned");
    else bad("it accepted an unsigned form");

    /* ------------------------------------------------------ 3. fill it in properly */
    await page.fill('[name="q_e"]', "Typed.In@Example.COM");
    await page.fill('[name="q_ad"]', "2 Union Street, Newton Abbot");
    await page.fill('[name="q_pc"]', "TQ12 2JS");
    await page.fill('[name="q_br"]', "Border Collie");
    await page.fill('[name="q_vx"]', "2027-04-01");
    await page.locator('input[name="q_al"][value="yes"]').check({ force: true });
    await page.waitForTimeout(300);
    await page.fill('[name="q_al__detail"]', "Nervous of bicycles");
    /* q_sk deliberately left empty. */

    /* Sign by typing, which is the path a keyboard user takes. */
    const typeIt = page.getByRole("button", { name: /type my name/i }).first();
    if (await typeIt.count()) await typeIt.click({ force: true });
    await page.fill('[name="signer_name"]', person.name);
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /submit|send|done/i }).first().click({ force: true });
    await page.waitForTimeout(4000);

    const said = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    if (/thank you|that'?s done/i.test(said)) ok("it accepts a complete, signed form");
    else bad("submitting did not finish", said.slice(0, 120));

    await page.screenshot({
      path: path.join(require("os").tmpdir(), "second-pair-shots", "form-filled.png"),
      fullPage: true,
    });
    await browser.close();

    /* --------------------------------------------- 4. did it reach the record? */
    const { data: after } = await db
      .from("contacts")
      .select("name, phone, email, address, postcode, alert, notes, trade_facts")
      .eq("id", person.id)
      .maybeSingle();

    if (after.email === "typed.in@example.com") ok("the email reached the record, lowercased");
    else bad("the email did not reach the record", `record says "${after.email}"`);

    if (after.address === "2 Union Street, Newton Abbot" && after.postcode === "TQ12 2JS") {
      ok("the address and postcode reached the record");
    } else {
      bad("the address did not reach the record", `"${after.address}" / "${after.postcode}"`);
    }

    const facts = after.trade_facts ?? {};
    if (facts.vaccination_due === "2027-04-01") ok("the vaccination expiry reached the fact that blocks a booking");
    else bad("the vaccination fact did not land", JSON.stringify(facts));

    if (facts.breed === "Border Collie") ok("the breed was updated, not duplicated");
    else bad("the breed fact did not land", JSON.stringify(facts));

    if ((after.alert ?? "").includes("Nervous of bicycles")) ok("what to watch for reached the alert");
    else bad("the alert did not land", `alert is "${after.alert}"`);

    /* The one that matters. */
    if ((after.notes ?? "") === "Do not lose me") {
      ok("a question left blank changed nothing, and the old note survived");
    } else {
      bad("a blank answer touched the notes", `notes are "${after.notes}"`);
    }
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
