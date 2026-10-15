/*
 * What each client still needs to do, in their own words.
 *
 *   npx tsx scripts/client-checklist.mjs                 every live business
 *   npx tsx scripts/client-checklist.mjs living-canvas-tattoo-nxst
 *   npx tsx scripts/client-checklist.mjs --all           demos and internal too
 *
 * Giles, 15 October: "put all the things the clients need to do for settings
 * etc on a list per client on the main work list ... so I can have check-ins
 * with the client to discuss. Every time I create a new business give me a
 * review check-in list."
 *
 * This is that list, and it is generated rather than written down, because a
 * handwritten one is out of date the moment a client changes a setting and a
 * check-in built on a stale list wastes their time and his.
 *
 * It reuses `readinessOf`, which the owner's own dashboard already runs. That
 * matters: a second copy of "what is missing" would drift from the first, and
 * then Giles and the client would be looking at two different answers to the
 * same question. It is also already phrased the right way round. The dashboard
 * comment puts it better than I can:
 *
 *   "Add your services" is a task; "it cannot quote anything, so it hands
 *   every pricing question to you" is a consequence, and consequences get
 *   acted on.
 *
 * So the client list is consequences, ordered with the blocking ones first,
 * because somebody who fixes only the top item has fixed the thing their next
 * customer would have hit.
 *
 * A few things the readiness check cannot see are added underneath: whether
 * anybody's phone actually buzzes, whether a confirmation goes out, whether
 * there is a review link or a picture. Those are not capabilities, they are
 * things nobody has got round to, and they are the usual contents of a
 * check-in.
 */
import { db as connect } from "./_tidy.mjs";
import { readinessOf } from "../src/lib/readiness.ts";

/* _tidy exports a factory, not a client. */
const db = connect();

const args = process.argv.slice(2);
const wantAll = args.includes("--all");
const only = args.filter((a) => !a.startsWith("-"));

const bar = (s = "=") => s.repeat(74);

/** Things a readiness check does not ask, and a check-in always does. */
async function theRest(studio) {
  const out = [];

  const { data: devices, error: devErr } = await db
    .from("push_subscriptions")
    .select("id")
    .eq("studio_id", studio.id)
    .limit(1);
  if (devErr) throw new Error(`devices: ${devErr.message}`);
  if (!devices?.length) {
    out.push([
      "Nothing buzzes a phone",
      "No device is registered, so nobody is told when a customer writes. " +
        "It has to be done on the phone itself: Settings, then You.",
    ]);
  }

  /*
   * A confirmation is a reminder template sent nought hours before.
   *
   * The first version of this asked message_templates for kind="confirmation".
   * Neither the table nor the column exists, PostgREST refused the whole
   * query, and the error was never read, so every business came back as
   * having no confirmation. It said Amber's had none, and Amber's has had one
   * since September. A checker that is wrong in the direction of "there is
   * work to do" is the worst kind, because it survives review.
   */
  const { data: confirm, error: confirmErr } = await db
    .from("reminder_templates")
    .select("id, enabled")
    .eq("studio_id", studio.id)
    .eq("hours_before", 0);
  if (confirmErr) throw new Error(`confirmations: ${confirmErr.message}`);
  if (!confirm?.some((c) => c.enabled !== false)) {
    out.push([
      "Nobody is told their booking went through",
      "No confirmation is set up, so a customer books and gets nothing in " +
        "writing. Settings, then Messages you send.",
    ]);
  }

  if (!studio.review_url) {
    out.push([
      "Nobody is ever asked for a review",
      "No review link is set, so the assistant cannot ask. It is built and " +
        "proved, and off because nobody has pasted a link in.",
    ]);
  }

  if (!studio.photo_path) {
    out.push([
      "Confirmations go out with no picture",
      "No photograph has been uploaded, so every confirmation looks plainer " +
        "than it needs to.",
    ]);
  }

  const { count: contacts } = await db
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studio.id);

  return { out, contacts: contacts ?? 0 };
}

(async () => {
  let q = db.from("studios").select("*").is("archived_at", null).order("name");
  const { data: studios, error } = await q;
  if (error) {
    console.log(`  FAULT could not read the businesses: ${error.message}`);
    process.exit(1);
  }

  const doing = (studios ?? []).filter((s) => {
    if (only.length) return only.includes(s.slug);
    /*
     * Not kind === "customer", which would miss two of the three.
     *
     * Living Canvas and Neat & Tidy are both recorded as "internal" even
     * though they are real businesses with real customers on them. Flagged
     * for Giles rather than corrected here, because kind may mean something
     * to billing. Until it is settled, a live client is anything that is not
     * a demo and is not Second Pair's own studio.
     */
    return wantAll ? true : s.kind !== "demo" && s.slug !== "help";
  });

  if (!doing.length) {
    console.log(
      `\n  Nothing matched. Live businesses are: ` +
        (studios ?? [])
          .filter((s) => s.kind === "customer")
          .map((s) => s.slug)
          .join(", ") +
        `\n  Pass --all for demos and internal.\n`,
    );
    return;
  }

  console.log(`\nCLIENT CHECK-IN LISTS`);
  console.log(`${new Date().toISOString().slice(0, 10)}  ${doing.length} business(es)\n`);

  for (const studio of doing) {
    const caps = await readinessOf(db, studio);
    const notReady = caps.filter((c) => !c.ready);
    const blocking = notReady.filter((c) => c.blocking);
    const rest = notReady.filter((c) => !c.blocking);
    const { out: extras, contacts } = await theRest(studio);

    console.log(bar());
    console.log(`${studio.name}`);
    console.log(`${studio.slug}  ${contacts} customer${contacts === 1 ? "" : "s"} on file`);
    console.log(bar());

    if (!notReady.length && !extras.length) {
      console.log(`\n  Nothing outstanding. Everything the assistant needs is set up.\n`);
      continue;
    }

    if (blocking.length) {
      console.log(`\n  STOPS IT WORKING\n`);
      for (const c of blocking) {
        console.log(`    ${c.can}`);
        console.log(`      ${c.otherwise}`);
        console.log(`      ${c.action}  (${c.href})\n`);
      }
    }

    if (rest.length) {
      console.log(`  MAKES IT WORSE\n`);
      for (const c of rest) {
        console.log(`    ${c.can}`);
        console.log(`      ${c.otherwise}`);
        console.log(`      ${c.action}  (${c.href})\n`);
      }
    }

    if (extras.length) {
      console.log(`  BUILT, AND SWITCHED OFF BY OMISSION\n`);
      for (const [what, why] of extras) {
        console.log(`    ${what}`);
        console.log(`      ${why}\n`);
      }
    }
  }

  console.log(
    `Generated, not written down. Run it again before a check-in rather than\n` +
      `trusting a copy, because a client changing one setting changes this.\n`,
  );
})();
