/**
 * Is the live site actually working?
 *
 *   node scripts/check-live.mjs
 *   node scripts/check-live.mjs --ask     (also asks the assistant a question)
 *
 * Run it after every deploy. Each check is written to fail for one reason, so
 * a red line tells you where to look rather than that something, somewhere, is
 * wrong. The order matters: DNS before HTTPS before the app before the
 * database, because each one only makes sense if the one before it passed.
 *
 * --ask costs a few pence of API credit and writes a conversation into the test
 * studio, so it is off by default.
 */
import fs from "node:fs";

const SITE = process.env.SITE_URL ?? "https://www.second-pair.com";
const ASK = process.argv.includes("--ask");

const env = (() => {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
})();

let failed = 0;
let warned = 0;

const pass = (what, detail = "") => console.log(`  \x1b[32mok\x1b[0m    ${what}${detail ? `  ${detail}` : ""}`);
const fail = (what, why) => { failed++; console.log(`  \x1b[31mFAIL\x1b[0m  ${what}\n        ${why}`); };
const warn = (what, why) => { warned++; console.log(`  \x1b[33mwarn\x1b[0m  ${what}\n        ${why}`); };

const heading = (text) => console.log(`\n${text}\n${"─".repeat(text.length)}`);

async function get(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(`${SITE}${path}`, { ...options, signal: controller.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

/*
 * Looked up over HTTPS rather than with node's resolver.
 *
 * node:dns talks to whatever resolver the machine is configured with, and on a
 * corporate or sandboxed network that is often something that answers nothing.
 * It reported this very domain as missing while the site was serving perfectly
 * — a health check that cries wolf is worse than no health check.
 */
async function lookup(name, type) {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { Accept: "application/dns-json" } },
  ).catch(() => null);

  if (!res?.ok) return null;
  const body = await res.json().catch(() => null);
  return (body?.Answer ?? []).map((a) => String(a.data).replace(/^"|"$/g, ""));
}

// ------------------------------------------------------------------- the name
heading("The domain");

const host = new URL(SITE).hostname;
const apex = host.replace(/^www\./, "");

const apexRecords = await lookup(apex, "A");
if (apexRecords === null) warn(`could not look up ${apex}`, "the DNS-over-HTTPS query itself failed");
else if (apexRecords.length) pass(`${apex} resolves`, apexRecords.join(", "));
else fail(`${apex} does not resolve`, "DNS is not pointed, or has not propagated.");

const wwwRecords = await lookup(`www.${apex}`, "CNAME");
const wwwA = wwwRecords?.length ? null : await lookup(`www.${apex}`, "A");
if (wwwRecords?.length) pass(`www.${apex} points at`, wwwRecords.join(", "));
else if (wwwA?.length) pass(`www.${apex} resolves`, wwwA.join(", "));
else if (wwwRecords === null) warn(`could not look up www.${apex}`, "the query failed");
else fail(`www.${apex} does not resolve`, "The CNAME is missing.");

// ------------------------------------------------------------------- the mail
heading("Email records");

const sendCname = await lookup(`send.${apex}`, "CNAME");
const sendTxt = sendCname?.length ? null : await lookup(`send.${apex}`, "TXT");
if (sendCname?.length) pass("send subdomain is set up", "carries the sending permission and bounces");
else if (sendTxt?.length) pass("send subdomain has an SPF record");
else warn("send subdomain is missing", "Resend cannot send as this domain yet.");

const dkim = await lookup(`resend._domainkey.${apex}`, "TXT");
const dkimValue = (dkim ?? []).join("");
if (!dkim?.length) warn("DKIM is not published", "Mail will be untrusted and Resend will not verify the domain.");
else if (/^p=|v=DKIM/i.test(dkimValue)) pass("DKIM is published", `${dkimValue.length} characters`);
else fail("DKIM holds the wrong value", `found "${dkimValue.slice(0, 40)}" — copy the real one from Resend`);

/*
 * DMARC, which nothing breaks without and deliverability quietly suffers over.
 *
 * Gmail and Yahoo have required it of anybody sending in volume since early
 * 2024. Without it the mail is not rejected — it is scored worse, which is the
 * hardest kind of problem to notice, because everything looks like it worked.
 */
const dmarc = ((await lookup(`_dmarc.${apex}`, "TXT")) ?? []).join("");
if (/v=DMARC/i.test(dmarc)) pass("DMARC is published", dmarc.slice(0, 48));
else
  warn(
    "DMARC is not published",
    'Add a TXT record at _dmarc with "v=DMARC1; p=none; rua=mailto:info@second-pair.com".',
  );

// -------------------------------------------------------------------- the app
heading("The application");

let reachable = false;
try {
  const home = await get("/");
  reachable = true;
  if (home.status >= 200 && home.status < 400) pass("the site responds", `${home.status}`);
  else fail("the site responded badly", `status ${home.status}`);
} catch (error) {
  fail("the site could not be reached", `${error.message} — certificate or deployment`);
}

if (reachable) {
  for (const path of ["/login", "/privacy", "/terms"]) {
    const res = await get(path).catch(() => null);
    if (res && res.status === 200) pass(`${path} loads`);
    else fail(`${path} did not load`, res ? `status ${res.status}` : "no response");
  }
}

/*
 * What the running app can actually do.
 *
 * The records above prove the domain is ready to send. They say nothing about
 * whether the deployment holds the keys to do it — that lives in a different
 * dashboard, and it is the half that is usually missing. Until now the only
 * way to find out was to do the thing and see: send a real password reset,
 * take a real deposit. A bad way to learn that a key was pasted with a
 * trailing space.
 */
heading("What the live app can do");

if (!env.CRON_SECRET) {
  warn("cannot check the keys", "CRON_SECRET is not in .env.local, so /api/health cannot be read.");
} else {
  try {
    const res = await get(`/api/health?key=${encodeURIComponent(env.CRON_SECRET)}`);
    if (res.status === 404) {
      warn("the health endpoint is not deployed yet", "Push and redeploy, then run this again.");
    } else if (!res.ok) {
      fail("could not read the health endpoint", `HTTP ${res.status}`);
    } else {
      const can = JSON.parse(await res.text());

      /*
       * The build first, because it changes what a missing key means.
       *
       * A variable added after the running deployment was built is simply not
       * there yet, and no amount of checking the dashboard will show that.
       */
      if (can.deployment && !can.deployment.commit) {
        /*
         * A command-line deploy has no commit for Vercel to name. Saying so is
         * better than saying nothing, which is what this did — and silence
         * from a check that is meant to answer "is my code live" reads as a
         * stale build, which cost a long evening.
         */
        pass(
          "deployed from the command line",
          `${can.deployment.environment} — no commit recorded, so nothing to compare`,
        );
      } else if (can.deployment?.commit) {
        const local = (await import("node:child_process"))
          .execSync("git rev-parse --short HEAD")
          .toString()
          .trim();
        if (can.deployment.commit === local)
          pass("the live build is current", `${can.deployment.commit} on ${can.deployment.branch}`);
        else
          warn(
            `the live build is ${can.deployment.commit}, yours is ${local}`,
            "Anything added since that build — code or environment variables — is not live yet.",
          );
      }

      // Both halves are named separately, because "email does not work" sends
      // you to the wrong dashboard half the time.
      if (can.email?.sendsMail) pass("the app can send email", "key and sender address both set");
      else if (can.email?.apiKey && !can.email?.from)
        fail("EMAIL_FROM is missing", "The Resend key is set, but nothing sends without a sender address.");
      else if (!can.email?.apiKey && can.email?.from)
        fail("RESEND_API_KEY is missing", "The sender address is set, but there is no key to send with.");
      else fail("the app cannot send email", "Neither RESEND_API_KEY nor EMAIL_FROM is set in Vercel.");

      if (can.assistant) pass("the assistant is connected");
      else fail("the assistant is not connected", "ANTHROPIC_API_KEY is missing.");

      if (can.supportStudio) pass("the help assistant is pointed at a studio");
      else warn("no support studio", "The floating help button will not appear at all.");

      if (can.push) pass("push notifications are configured");
      else warn("push is not configured", "Nobody is told when something needs them.");

      if (can.payments) pass("Stripe is connected");
      else warn("Stripe is not connected", "Deposits cannot be taken — expected until you set it up.");

      if (can.texts) pass("Twilio is connected");
      else warn("Twilio is not connected", "Texts and WhatsApp are off — expected until the number clears.");
    }
  } catch (error) {
    fail("could not reach the health endpoint", String(error?.message ?? error));
  }
}

// --------------------------------------------------------------- the database
heading("The database");

if (reachable) {
  /*
   * A real slug against an invented one.
   *
   * If both 404 the app cannot read the database — which is what a wrong
   * service-role key looks like, because the anon key authenticates happily and
   * then row-level security hides every row. No error anywhere.
   */
  const slug = process.env.CHECK_SLUG ?? "living-canvas-tattoo-nxst";
  const real = await get(`/widget/${slug}`).catch(() => null);
  const fake = await get("/widget/definitely-not-a-studio").catch(() => null);

  if (real?.status === 200 && fake?.status === 404) {
    pass("a real business loads and an invented one does not");
  } else if (real?.status === 404 && fake?.status === 404) {
    fail(
      "the app cannot read the database",
      "A real slug 404s exactly like a made-up one. Check SUPABASE_SERVICE_ROLE_KEY in Vercel — the anon key looks identical and fails silently.",
    );
  } else {
    warn("could not tell", `real ${real?.status}, invented ${fake?.status} (is CHECK_SLUG right?)`);
  }
}

// ------------------------------------------------------------ the scheduled job
heading("The scheduled job");

if (reachable) {
  const bare = await get("/api/cron/reminders").catch(() => null);
  if (bare?.status === 401) pass("reminders endpoint is protected", "CRON_SECRET is reaching the app");
  else if (bare?.status === 503) fail("CRON_SECRET is not set in Vercel", "the job returns 503 and no reminder is ever sent");
  else warn("unexpected response", `status ${bare?.status}`);

  if (env.CRON_SECRET) {
    const authed = await get("/api/cron/reminders", {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    }).catch(() => null);
    if (authed?.status === 200) {
      const body = await authed.json().catch(() => null);
      pass("the job runs", body ? `due ${body.due}, sent ${body.sent}, waiting ${body.waiting}` : "");
    } else if (authed?.status === 401) {
      warn("your local CRON_SECRET does not match Vercel's", "not fatal, but the two should be the same");
    }
  }
}

// ------------------------------------------------------------- the assistant
if (ASK && reachable) {
  heading("The assistant");
  const slug = process.env.CHECK_SLUG ?? "living-canvas-tattoo-nxst";
  const res = await get("/api/widget/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studio: slug,
      session: `healthcheck-${process.env.CHECK_STAMP ?? "manual"}`,
      message: "hi, roughly how much would a small tattoo be?",
    }),
  }).catch(() => null);

  const body = await res?.json().catch(() => null);
  const reply = body?.reply ?? "";

  if (!reply) fail("the assistant did not answer", `status ${res?.status}`);
  else {
    pass("it answered", `${reply.length} characters`);
    if (/assistant|automated|not a (real )?person/i.test(reply)) pass("it says it is an assistant");
    else fail("no disclosure in the opener", "every first reply must say so");
    if (/£\s?\d/.test(reply)) pass("it quoted a figure");
    else warn("no price in the reply", "may be fine depending on what it asked back");
  }
}

// ------------------------------------------------------------------- the verdict
console.log();
if (failed) {
  console.log(`\x1b[31m${failed} check${failed === 1 ? "" : "s"} failed\x1b[0m${warned ? `, ${warned} warning${warned === 1 ? "" : "s"}` : ""}`);
} else if (warned) {
  console.log(`\x1b[33mEverything essential passed, ${warned} warning${warned === 1 ? "" : "s"}\x1b[0m`);
} else {
  console.log("\x1b[32mAll good.\x1b[0m");
}

process.exit(failed ? 1 : 0);
