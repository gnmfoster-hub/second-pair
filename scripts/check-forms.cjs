/*
 * Signing a consent form, and then trying to sign it again.
 *
 * A consent form is the one thing here with a life after the appointment: it
 * is the salon's defence if somebody reacts to a colour. What would hurt is a
 * second submission overwriting the first signature, or a withdrawn or expired
 * link still taking one.
 *
 * The first version of this posted the form fields at the route directly. All
 * three checks passed and none of them had submitted anything — a server
 * action is not a form post, and the fields are named q_<id> rather than <id>
 * either way. Three green ticks for a request that did nothing, which is the
 * exact fault this whole night has been about. So: a real browser, filling the
 * real page.
 */
require("./pw/look.cjs"); // for the credentials, from .env.local
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { randomBytes } = require("node:crypto");

const SITE = "https://www.second-pair.com";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};

const BLOCKS = [
  { id: "tested", type: "date", label: "Date of patch test", required: true },
  { id: "reaction", type: "yesno", label: "Ever had a reaction?", required: true },
  { id: "sign", type: "signature", label: "Sign here", required: true },
];

(async () => {
  const { data: studio } = await db
    .from("studios")
    .select("id, name")
    .eq("slug", "willow-demo")
    .single();

  const { data: person, error: pe } = await db
    .from("contacts")
    .insert({ studio_id: studio.id, name: "CHECK Dawn Pethick" })
    .select("id")
    .single();
  if (pe) return console.log("could not make a contact:", pe.message);

  const forms = [];
  const makeForm = async (extra = {}) => {
    const token = randomBytes(24).toString("base64url");
    const { data, error } = await db
      .from("client_forms")
      .insert({
        studio_id: studio.id,
        contact_id: person.id,
        title: "CHECK — patch test",
        blocks: BLOCKS,
        status: "opened",
        token,
        ...extra,
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);
    forms.push(data);
    return data;
  };

  const browser = await chromium.launch({ channel: "chrome", headless: true });

  /** Fill the page in and press the button. Returns what it says afterwards. */
  const signIt = async (token, signerName) => {
    const page = await browser.newPage();
    await page.goto(`${SITE}/f/${token}`, { waitUntil: "networkidle" });

    const body = await page.locator("body").innerText();
    // A form that refuses is supposed to say so rather than show the questions.
    if (!(await page.locator('input[name="q_tested"]').count())) {
      await page.close();
      return { refused: true, said: body.replace(/\s+/g, " ").slice(0, 120) };
    }

    await page.fill('input[name="q_tested"]', "2026-09-01");
    await page.locator('input[name="q_reaction"][value="No"]').first().check().catch(async () => {
      await page.locator('input[name="q_reaction"]').last().check();
    });

    // Sign by typing, which is the option that needs no canvas.
    const typeInstead = page.getByRole("button", { name: /type/i });
    if (await typeInstead.count()) await typeInstead.first().click();

    await page.fill('input[name="signer_name"]', signerName);
    const typed = page.locator('input[placeholder*="name" i]').first();
    if (await typed.count()) await typed.fill(signerName).catch(() => {});

    await page.getByRole("button", { name: /submit|sign|send/i }).last().click();
    await page.waitForTimeout(3500);

    const after = await page.locator("body").innerText();
    await page.close();
    return { refused: false, said: after.replace(/\s+/g, " ").slice(0, 140) };
  };

  console.log(`\n${studio.name} — consent forms\n`);

  // ---- a withdrawn form
  const voided = await makeForm({ status: "void" });
  const voidResult = await signIt(voided.token, "Dawn Pethick");
  const { data: afterVoid } = await db
    .from("client_forms")
    .select("status, signed_at")
    .eq("id", voided.id)
    .single();
  if (afterVoid.status === "signed" || afterVoid.signed_at) bad("a withdrawn form was signed");
  else ok(`a withdrawn form refuses: "${voidResult.said.slice(0, 70)}"`);

  // ---- an expired link
  const stale = await makeForm({ expires_at: new Date(Date.now() - 86_400_000).toISOString() });
  await signIt(stale.token, "Dawn Pethick");
  const { data: afterStale } = await db
    .from("client_forms")
    .select("status, signed_at")
    .eq("id", stale.id)
    .single();
  if (afterStale.status === "signed" || afterStale.signed_at) bad("an expired link was signed");
  else ok("an expired link refuses a signature");

  // ---- the real one, signed once
  const live = await makeForm();
  const first = await signIt(live.token, "Dawn Pethick");
  const { data: once } = await db
    .from("client_forms")
    .select("status, signed_at, signer_name, answers")
    .eq("id", live.id)
    .single();

  if (once.status !== "signed") {
    bad("signing it did not sign it", `status is ${once.status} — it said: ${first.said}`);
  } else {
    ok(`signed by ${once.signer_name}, answers kept: ${JSON.stringify(once.answers).slice(0, 60)}`);

    // ---- and again
    const second = await signIt(live.token, "Somebody Else");
    const { data: twice } = await db
      .from("client_forms")
      .select("signed_at, signer_name, answers")
      .eq("id", live.id)
      .single();

    if (twice.signer_name !== once.signer_name) {
      bad("a second submission overwrote the signature", `${once.signer_name} became ${twice.signer_name}`);
    } else if (twice.signed_at !== once.signed_at) {
      bad("a second submission moved the date it was signed");
    } else {
      ok(`signing again changes nothing — it says "${second.said.slice(0, 60)}"`);
    }
  }

  await browser.close();
  for (const f of forms) await db.from("client_forms").delete().eq("id", f.id);
  await db.from("contacts").delete().eq("id", person.id);

  console.log(faults ? `\n${faults} wrong.` : "\nA signature is taken once, and only once.");
  process.exitCode = faults ? 1 : 0;
})();
