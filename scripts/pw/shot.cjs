/*
 * Pictures of the local build, for looking at a re-theme before it ships.
 *
 *   PAGES='/,/company' W=390 OUT=/somewhere node scripts/pw/shot.cjs
 *
 * look.cjs signs in and photographs the app; this one wants no account and
 * points at whatever scripts/pw/serve.sh is serving.
 */
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const out = process.env.OUT;
  const w = Number(process.env.W || 1280);
  const pages = (process.env.PAGES || "/").split(",");
  for (const url of pages) {
    const name = url === "/" ? "home" : url.replace(/\//g, "-").replace(/^-/, "");
    const p = await b.newPage({ viewport: { width: w, height: 1000 } });
    await p.goto("http://localhost:3130" + url, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    await p.close();
  }
  await b.close();
})();
