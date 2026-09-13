/**
 * Wait for a new deployment, and say so once.
 *
 *   node scripts/watch-deploy.mjs <sha> [minutes]
 *
 * Ask the thing that knows, which is the deployment status GitHub records
 * against the commit.
 *
 * The first version of this watched the live site for a changed ETag or a
 * purged edge cache, and reported no deploy for a deploy that had already
 * succeeded. The home page is prerendered and its bytes had not changed, so it
 * kept serving the same cached copy with a climbing Age — a perfect,
 * confident, wrong answer. Measuring a proxy for the thing is how you end up
 * measuring the proxy.
 */
const REPO = "gnmfoster-hub/second-pair";

async function probe(sha) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/commits/${sha}/status`, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
  const body = await r.json();
  const vercel = (body.statuses ?? []).find((x) => /vercel/i.test(x.context ?? ""));
  return { state: vercel?.state ?? "pending", url: vercel?.target_url ?? "" };
}

const sha = process.argv[2];
if (!sha) {
  console.log("Give it a commit sha.");
  process.exit(1);
}
const minutes = Number(process.argv[3]) || 20;
const deadline = Date.now() + minutes * 60_000;

console.log(`WATCHING — ${sha.slice(0, 7)}`);

while (Date.now() < deadline) {
  let now;
  try {
    now = await probe(sha);
  } catch {
    // A blip is not an answer. Try again on the next pass.
    await new Promise((r) => setTimeout(r, 20_000));
    continue;
  }

  if (now.state === "success") {
    console.log(`DEPLOYED — ${sha.slice(0, 7)} is live. ${now.url}`);
    process.exit(0);
  }

  if (now.state === "failure" || now.state === "error") {
    console.log(`BUILD FAILED — ${sha.slice(0, 7)} did not deploy. ${now.url}`);
    process.exit(0);
  }

  await new Promise((r) => setTimeout(r, 20_000));
}

console.log(`STILL BUILDING AFTER ${minutes} MINUTES — ${sha.slice(0, 7)} has not finished.`);
