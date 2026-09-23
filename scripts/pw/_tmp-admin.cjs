const path = require("path");
const REPO = path.join(process.env.USERPROFILE, "Desktop", "inkdesk");
const { chromium } = require(path.join(REPO, "node_modules", "playwright-core"));
const { signIn } = require(path.join(REPO, "scripts/pw/look.cjs"));
const { createClient } = require(path.join(REPO, "node_modules", "@supabase", "supabase-js"));

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: studio } = await db.from("studios").select("id").eq("slug", "help").single();
  const { data: owner } = await db.from("studio_members").select("user_id").eq("studio_id", studio.id).limit(1);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const page = await signIn(context, owner[0].user_id, "/admin");
  await page.waitForLoadState("networkidle");

  // Find the Willow card and open it, the way a person would.
  await page.getByPlaceholder(/find|search/i).first().fill("Willow").catch(() => {});
  await page.waitForTimeout(500);
  const manage = page.getByRole("button", { name: "Manage" }).first();
  console.log("Manage buttons:", await page.getByRole("button", { name: "Manage" }).count());
  await manage.click();
  await page.waitForTimeout(1200);

  const body = await page.locator("body").innerText();
  for (const s of ["Receptionist sold", "Email and text together", "Text ceiling", "Receptionist — not sold"]) {
    console.log(`  "${s}": ${body.includes(s)}`);
  }
  const box = page.locator('input[name="receptionist_allowed"]');
  console.log("checkbox present:", await box.count(), "checked:", await box.first().isChecked().catch(() => "n/a"));
  await browser.close();
})();
