/*
 * Can Amber get a completed form back out as a file?
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-form-download.cjs
 *
 * Giles: "there would also be a download button in the client record in case
 * Amber needs to download the form later." Three things have to be true, and
 * the third is the one worth checking hardest.
 *
 *   1. the button is there on a signed form
 *   2. it hands over a file, with the questions, the answers and the signature
 *   3. it refuses another business's form
 *
 * Demos only. Everything it writes is removed afterwards.
 */
const path = require("path");
const { signIn, SITE } = require("./pw/look.cjs");
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

const mess = { forms: [] };
async function tidyUp() {
  if (mess.forms.length) await db.from("client_forms").delete().in("id", mess.forms);
  console.log(`\n  tidied: ${mess.forms.length} form(s)`);
}

const BLOCKS = [
  { id: "t", type: "text", label: "A check, not a real form." },
  { id: "q1", type: "short", label: "Dog's name" },
  { id: "q2", type: "yesno", label: "Anything to watch for", detailOnYes: true },
  { id: "sign", type: "signature", label: "Signature" },
];

const ANSWERS = { q1: "Bramble", q2: "yes", q2__detail: "Nervous of bicycles" };

async function makeSigned(studioId, contactId, title) {
  const { data, error } = await db
    .from("client_forms")
    .insert({
      studio_id: studioId,
      contact_id: contactId,
      title,
      blocks: BLOCKS,
      answers: ANSWERS,
      status: "signed",
      signed_at: new Date().toISOString(),
      signer_name: "Sam Tester",
      signature: "typed:Sam Tester",
      signer_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      signer_ip: "203.0.113.7",
      token: randomBytes(24).toString("base64url"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  mess.forms.push(data.id);
  return data.id;
}

(async () => {
  const { data: studios } = await db
    .from("studios")
    .select("id, name, slug")
    .in("slug", ["willow-demo", "ashcroft-demo"]);

  const mine = studios.find((s) => s.slug === "willow-demo");
  const other = studios.find((s) => s.slug === "ashcroft-demo");
  if (!mine || !other) {
    note("need both willow-demo and ashcroft-demo");
    process.exit(0);
  }

  const pick = async (studioId) => {
    const { data } = await db
      .from("contacts")
      .select("id, name")
      .eq("studio_id", studioId)
      .not("name", "is", null)
      .limit(1)
      .maybeSingle();
    return data;
  };

  const theirs = await pick(mine.id);
  const strangers = await pick(other.id);
  if (!theirs || !strangers) {
    note("a demo has no clients");
    process.exit(0);
  }

  console.log(`\n${mine.name} · ${theirs.name}\n`);

  try {
    const formId = await makeSigned(mine.id, theirs.id, "Download check");
    const elsewhere = await makeSigned(other.id, strangers.id, "Somebody else's form");

    const { data: members } = await db
      .from("studio_members")
      .select("user_id, role")
      .eq("studio_id", mine.id);
    const owner = (members ?? []).find((m) => m.role === "owner") ?? (members ?? [])[0];

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const page = await signIn(context, owner.user_id, `/clients/${theirs.id}/forms/${formId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    /* 1. the button */
    const button = page.getByRole("link", { name: /download a copy/i }).first();
    if (await button.count()) ok("there is a download button on a signed form");
    else bad("no download button", (await page.locator("main").innerText()).slice(0, 100));

    /* 2. what comes back */
    const got = await page.request.get(`${SITE}/clients/${theirs.id}/forms/${formId}/download`);
    if (!got.ok()) {
      bad("the download did not come back", `${got.status()}`);
    } else {
      const disp = got.headers()["content-disposition"] ?? "";
      if (/attachment/.test(disp)) ok(`it arrives as a file (${disp.slice(0, 60)})`);
      else bad("it is not sent as a file", disp || "no content-disposition");

      const html = await got.text();
      const has = (what, bit) => {
        if (html.includes(bit)) ok(`the file has ${what}`);
        else bad(`the file is missing ${what}`, bit.slice(0, 40));
      };
      has("the question", "Dog&#039;s name".replace("&#039;", "'"));
      has("the answer", "Bramble");
      has("what they said when they ticked yes", "Nervous of bicycles");
      has("the signature", "Sam Tester");
      has("when and on what it was signed", "an iPhone");

      if (/Typed as their signature/.test(html)) {
        ok("and a typed signature is said to be typed, not dressed up as a drawing");
      } else {
        bad("a typed signature is not labelled as typed");
      }

      if (/@media print/.test(html)) ok("it prints to a PDF cleanly");
      else bad("no print styling in the file");
    }

    /* 3. the one that matters */
    const nosy = await page.request.get(`${SITE}/clients/${strangers.id}/forms/${elsewhere}/download`);
    if (nosy.status() === 404) ok("another business's form is refused");
    else bad("another business's form came back", `status ${nosy.status()}`);

    await page.screenshot({
      path: path.join(require("os").tmpdir(), "second-pair-shots", "form-record.png"),
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
