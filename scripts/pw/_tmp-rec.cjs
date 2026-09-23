const path = require("path");
const REPO = path.join(process.env.USERPROFILE, "Desktop", "inkdesk");
const { chromium } = require(path.join(REPO, "node_modules", "playwright-core"));
const { signIn } = require(path.join(REPO, "scripts/pw/look.cjs"));
const { createClient } = require(path.join(REPO, "node_modules", "@supabase", "supabase-js"));
const OUT = "C:/Users/gnmfo/AppData/Local/Temp/claude";

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: studio } = await db.from("studios").select("id").eq("slug", "willow-demo").single();
  const { data: owner } = await db.from("studio_members").select("user_id").eq("studio_id", studio.id).limit(1);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1000, height: 1600 }, deviceScaleFactor: 1 });
  const page = await signIn(context, owner[0].user_id, "/settings/install");
  await page.waitForLoadState("networkidle");

  const panel = page.locator("section").filter({ hasText: "Receptionist" }).last();
  console.log("panel found:", await panel.count());
  console.log("---- panel text ----");
  console.log((await panel.innerText()).slice(0, 900));
  await panel.locator('input[name="receptionist_on"]').check();
  await panel.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(2500);
  console.log("---- after saving ----");
  console.log((await panel.innerText()).slice(0, 900));
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: OUT + "/receptionist.png" });
  await browser.close();
})();
