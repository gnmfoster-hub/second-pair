/**
 * Wait for a new deployment to reach the live site, and say so once.
 *
 *   node scripts/watch-deploy.mjs [minutes]
 *
 * There is no build id to read: Next 16 names its chunks by content hash under
 * /_next/static/immutable/, so a page whose bytes did not change keeps the same
 * names across deploys. Two signals together are reliable enough:
 *
 *   - the ETag, which changes whenever the rendered page changes, and
 *   - the CDN Age, which a deploy resets because it purges the edge cache.
 *
 * Age alone would be noisy, since a cache can expire on its own. Age falling
 * off a cliff — hours to seconds — is a deploy. One line either way, because
 * something treating each line as an event is reading this.
 */
const URL = "https://www.second-pair.com/";

async function probe() {
  const r = await fetch(URL, { method: "HEAD", cache: "no-store" });
  return {
    etag: r.headers.get("etag") ?? "",
    age: Number(r.headers.get("age") ?? "0"),
  };
}

const minutes = Number(process.argv[2]) || 20;
const deadline = Date.now() + minutes * 60_000;

const first = await probe();
console.log(`WATCHING — etag ${first.etag.slice(1, 9)}…, age ${first.age}s`);

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 30_000));

  let now;
  try {
    now = await probe();
  } catch {
    // A blip is not an answer. Try again on the next pass.
    continue;
  }

  const fresh = now.age < 120 && first.age > 600;
  const changed = now.etag !== first.etag;

  if (changed || fresh) {
    const why = changed ? "the page changed" : "the edge cache was purged";
    console.log(`DEPLOYED — ${why} (age ${now.age}s). The new build is live.`);
    process.exit(0);
  }
}

console.log(
  `NO DEPLOY IN ${minutes} MINUTES — the site is still serving the build it was. ` +
    "Worth checking Vercel for a failed build.",
);
