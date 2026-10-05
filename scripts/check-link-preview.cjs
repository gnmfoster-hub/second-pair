/*
 * What a link to a customer looks like when it lands in their messages.
 *
 *   sh scripts/pw/serve.sh && SITE=http://localhost:3130 node scripts/check-link-preview.cjs
 *
 * Giles, 5 October: "its sending the second pair logo in the text form link and
 * its the old logo."
 *
 * Every page we send a customer a link to is fetched by whatever app the link
 * lands in, and whatever Open Graph tags it finds are what the business's
 * customer sees. A page with none falls through to the site card, which is the
 * Second Pair wordmark and "You work, we answer" — so a business sending a
 * consent form delivers an advert for their supplier.
 *
 * This reads the tags the way a messaging app does, with no JavaScript, and
 * fails if any customer-facing page is still carrying ours.
 *
 * Reads only, on real tokens that already exist, and submits nothing.
 */
const { SITE } = require("./pw/look.cjs");
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let faults = 0;
const ok = (w) => console.log(`  ok    ${w}`);
const bad = (w, d) => {
  faults++;
  console.log(`  FAULT ${w}${d ? ` — ${d}` : ""}`);
};
const note = (w) => console.log(`  --    ${w}`);

/** The tags, read out of the raw HTML the way a preview fetcher does. */
async function preview(url) {
  const res = await fetch(url, { headers: { "user-agent": "WhatsApp/2.0" } });
  const html = await res.text();
  const pick = (prop) => {
    const m =
      html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, "i")) ||
      html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${prop}"`, "i"));
    return m ? m[1] : null;
  };
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    status: res.status,
    title: pick("og:title") || (title ? title[1] : null),
    image: pick("og:image"),
    description: pick("og:description"),
  };
}

/** Anything that would show the customer our branding instead of theirs. */
const OURS = /second[- ]?pair|social-card|you work, we answer/i;

(async () => {
  const { data: form } = await db
    .from("client_forms")
    .select("token, studios(name)")
    .not("token", "is", null)
    .limit(1)
    .maybeSingle();

  const { data: booking } = await db
    .from("bookings")
    .select("public_token")
    .not("public_token", "is", null)
    .limit(1)
    .maybeSingle();

  console.log("");

  /* ------------------------------------------------------------- the form */
  if (!form) {
    note("no form with a link to look at");
  } else {
    const seen = await preview(`${SITE}/f/${form.token}`);
    const whose = form.studios?.name ?? "the business";
    console.log(`  a form link for ${whose}`);
    console.log(`     title: ${seen.title}`);
    console.log(`     image: ${seen.image ?? "(none, which is right)"}`);

    if (seen.image && OURS.test(seen.image)) {
      bad("the preview shows our logo", seen.image);
    } else {
      ok("no Second Pair logo in the preview");
    }

    if (OURS.test(seen.title ?? "")) bad("the preview is titled with our name", seen.title);
    else ok("and it is titled for the business, not for us");

    if (OURS.test(seen.description ?? "")) bad("our strapline is in the preview", seen.description);
    else ok("and the description is about their form");
  }

  /* ---------------------------------------------------- and the other pages */
  if (booking) {
    const seen = await preview(`${SITE}/b/${booking.public_token}`);
    if (seen.image && OURS.test(seen.image)) bad("a booking page preview shows our logo", seen.image);
    else ok("a booking page preview is clean too");
  } else {
    note("no booking with a public link to look at");
  }

  /*
   * And the marketing site, which SHOULD carry our card. A check that only ever
   * says "no Second Pair anywhere" would pass just as well if the tags had been
   * deleted altogether.
   */
  const home = await preview(`${SITE}/`);
  if (home.image && OURS.test(home.image)) {
    ok("the marketing site still has our card, as it should");
  } else {
    bad("the marketing site has lost its own card", home.image ?? "none");
  }

  console.log(faults ? `\n${faults} fault(s)\n` : "\nnothing wrong\n");
  process.exit(faults ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
