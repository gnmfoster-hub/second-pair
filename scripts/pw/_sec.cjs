const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: Number(process.env.W || 1440), height: 1000 } });
  await p.goto("http://localhost:3130/", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  await p.evaluate((y) => window.scrollTo(0, Number(y)), process.env.Y || 900);
  await p.waitForTimeout(600);
  await p.screenshot({ path: process.env.OUT });
  await b.close();
})();
