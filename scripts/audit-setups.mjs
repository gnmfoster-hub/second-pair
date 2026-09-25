/**
 * What would the assistant actually do for each business on the system?
 *
 *   node scripts/audit-setups.mjs
 *
 * Not "is the configuration valid" — every one of these is valid, and that is
 * the point. It asks which settings lead somewhere silently wrong: an
 * appointment length nobody chose, a widget switched off, a diary nothing can
 * read, an inbox that does not exist. None of it errors, none of it appears in
 * a log, and all of it is only visible to the customer.
 *
 * Worth running after taking a business on, and after anybody changes their
 * settings for them.
 *
 * One warning, learned the hard way while writing it: ask for a column that
 * does not exist and PostgREST rejects the entire query and hands back null,
 * which reads exactly like "this business has none of those". The first run of
 * this reported that both live businesses had no services at all. They had
 * twelve between them. Check spellings against the table before believing a
 * clean sheet.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: studios } = await db.from("studios").select("*").is("archived_at", null);

/*
 * The two businesses that are meant to look unfinished.
 *
 * Brightwork is the "fresh" demo — scripts/demo-make.mjs builds it with the
 * comment "Deliberately unset: hours, prices, policy, privacy notice, FAQs",
 * because it exists to be walked through as a new owner would walk it. And the
 * `help` studio is our own support account: it answers questions about this
 * product and books nothing, so "cannot quote" is not a fault, it is the job.
 *
 * Without this the audit reported six faults that will never be fixed, on
 * every run, forever. A checker that cries wolf is worse than no checker: it
 * teaches whoever reads it to skim past the line that matters. The three real
 * faults on the live and demo businesses were sitting underneath that noise.
 *
 * They are still printed, and still described — just said as what they are.
 */
const BARE_ON_PURPOSE = {
  "brightwork-demo":
    "bare on purpose: this is the walkthrough demo, a business created an hour ago with the set-up still to do",
  help: "our own support account: it answers questions about this product and books nothing",
};

let real = 0;
const shops = new Set();
const demos = new Set();

for (const s of studios) {
  const [{ data: priced }, { data: listed }, { data: people }, { data: faqs }] = await Promise.all([
    db.from("price_bands").select("size_label, requires_consultation, duration_minutes, hours_low, hours_high").eq("studio_id", s.id),
    db.from("services").select("*").eq("studio_id", s.id).eq("active", true),
    db.from("artists").select("*").eq("studio_id", s.id),
    db.from("faqs").select("id").eq("studio_id", s.id).neq("answer", ""),
  ]);

  /*
   * Whichever way this business prices, described the same way.
   *
   * Reading price_bands regardless was this script agreeing that a salon on
   * the named list had nothing silently wrong while its list was empty — the
   * exact failure it exists to catch, on the table it was not looking at.
   *
   * A service belonging to one person is left out of the count on purpose:
   * the question here is whether the business can quote anybody who walks up,
   * and a nail technician's own list cannot answer that.
   */
  const byList = s.pricing_model === "services";
  const bands = byList
    ? (listed ?? [])
        .filter(x => x.kind === "service" && x.artist_id == null && x.bookable_online)
        .map(x => ({
          size_label: x.name,
          requires_consultation: x.requires_consultation,
          duration_minutes: x.minutes,
          hours_low: (x.minutes ?? 0) / 60,
          hours_high: (x.minutes ?? 0) / 60,
          price_pence: x.price_pence,
        }))
    : priced;

  // Something with no price is never offered, so a priced-by-list business
  // with unpriced rows quietly offers less than its list says.
  const unpriced = byList
    ? (bands ?? []).filter(b => b.price_pence == null).map(b => b.size_label)
    : [];

  const active = (people ?? []).filter(p => p.active);
  const openDays = (s.hours ?? []).filter(h => !h.closed).length;
  const faults = [];

  // The one that bit Neat & Tidy: no services means bookingTypeFor gets
  // undefined, which means durationFor falls through to consultation_minutes
  // and every appointment is that long, whatever the job is.
  if (unpriced.length) {
    faults.push(
      `NO PRICE ON ${unpriced.join(", ")} — never offered at all, because the ` +
      `alternative is inventing a number`,
    );
  }

  if (!bands?.length) {
    faults.push(
      `NO SERVICES — cannot quote, and every appointment would be booked as ` +
      `${s.consultation_minutes} minutes because that is what durationFor falls back to`,
    );
  }

  // A band that needs a consultation first is booked for consultation_minutes,
  // whatever the job is. That is right when somebody has set it deliberately
  // and absurd when it is still sitting at the default.
  const needsChat = (bands ?? []).filter(b => b.requires_consultation);
  if (needsChat.length && s.consultation_minutes <= 15) {
    faults.push(
      `${needsChat.map(b => b.size_label).join(", ")} require a consultation, and a ` +
      `consultation here is ${s.consultation_minutes} minutes — long enough for a phone ` +
      `call, not for looking at a job`,
    );
  }

  /*
   * Only the ones that would actually be booked as a session.
   *
   * This reported four faults that cannot happen. A band marked "consult
   * first" is never booked for its own length: bookingTypeFor sends it down
   * the consultation branch and durationFor returns consultation_minutes, so
   * max_session_minutes is never consulted at all. Ashcroft's sixteen-hour
   * rewire was reported as "would be booked short" when what actually happens
   * is a forty-five minute look at the job, which is correct and is the whole
   * point of the flag.
   *
   * Four of the five instances were that. The real one was a plasterer's
   * "Skim one room", eight hours, bookable straight off, and it would have
   * been six. It was sitting underneath the noise, which is what a check that
   * cries wolf costs.
   *
   * The consultation length is asked about separately, just above.
   */
  for (const b of bands ?? []) {
    if (b.requires_consultation) continue;
    if (b.duration_minutes != null && b.duration_minutes > s.max_session_minutes) {
      faults.push(
        `"${b.size_label}" is ${b.duration_minutes}m, longer than the ${s.max_session_minutes}m ` +
          `limit on one appointment, so it would be booked short and the diary would show ` +
          `them free while they are still on the job`,
      );
    }
  }
  if (!active.length) faults.push("NOBODY TAKING BOOKINGS — cannot offer or book anything");
  if (!openDays) faults.push("NO OPENING HOURS — cannot offer a single time");
  if (!s.email) faults.push("NO EMAIL — customer replies and new-booking alerts reach nobody");
  if (!s.privacy_notice_url) faults.push("NO PRIVACY NOTICE — the widget links nowhere");
  if ((faqs ?? []).length === 0) faults.push("NO ANSWERED FAQS — everything goes to a human");
  if (s.widget_enabled === false) faults.push("WIDGET SWITCHED OFF — no button on their site");

  for (const p of active) {
    if (p.booking_provider !== "native") {
      faults.push(`${p.name}: diary provider is "${p.booking_provider}" — check it can be read`);
    }
  }

  // A notice period longer than the window searched leaves nothing to offer.
  if (s.notice_hours >= 21 * 24) {
    faults.push(`NOTICE ${s.notice_hours}h swallows the whole three-week search window`);
  }

  /*
   * Where a deposit would land, which is not the same question on the two
   * payment models — and asking only the business one is how a salon of chair
   * renters reads as configured while every charge it takes is refused.
   *
   * Silent by design at every step: the charge is refused rather than routed
   * somewhere convenient, and a refusal in a conversation looks to the owner
   * like the customer changing their mind.
   */
  if (s.deposit_mode !== "none") {
    if (s.payment_model === "people") {
      const takers = active.filter(p => p.takes_deposits !== false);
      const stranded = takers.filter(p => !p.stripe_account_id).map(p => p.name);
      if (!takers.length) {
        faults.push("DEPOSITS ON AND NOBODY TAKES THEM — both switches have to agree on this model");
      } else if (stranded.length && !(s.payment_fallback && s.stripe_account_id)) {
        faults.push(
          `NO STRIPE FOR ${stranded.join(", ")} — money goes to each person here, so a ` +
          `deposit for their work is refused. Only they can connect it`,
        );
      } else if (stranded.length) {
        faults.push(
          `${stranded.join(", ")} have no Stripe, so their deposits land in the business ` +
          `account — which is what the per-person model exists to prevent`,
        );
      }
    } else if (!s.stripe_account_id) {
      faults.push("DEPOSITS ON AND NO STRIPE — nobody can pay one");
    }
  }

  // Deposits off is a decision. Payments off with a connected account is
  // usually somebody who has not found the switch.
  if (s.stripe_account_id && s.takes_payments !== true) {
    faults.push("STRIPE CONNECTED AND PAYMENTS OFF — every payment link is refused before it reaches Stripe");
  }

  const onPurpose = BARE_ON_PURPOSE[s.slug];

  console.log("=".repeat(66));
  console.log(`${s.name}  (${s.vertical}, deposits: ${s.deposit_mode})`);
  console.log("  services: " + (bands ?? []).map(b => `${b.size_label} ${b.duration_minutes ?? Math.round(b.hours_low * 60) + "-" + Math.round(b.hours_high * 60)}m${b.requires_consultation ? " [consult first]" : ""}`).join("; "));
  console.log(`  services ${bands?.length ?? 0} | people ${active.length} | open days ${openDays} | consultation ${s.consultation_minutes}m | max session ${s.max_session_minutes}m | notice ${s.notice_hours}h`);

  if (onPurpose) {
    /* Listed rather than hidden: somebody should still be able to see what is
       unset, without it being counted against anybody. */
    console.log(`  — ${onPurpose}`);
    for (const f of faults) console.log("    · " + f);
    continue;
  }

  if (!faults.length) console.log("  nothing silently wrong");
  for (const f of faults) console.log("  ✗ " + f);

  if (faults.length) {
    /*
     * A demo and a paying customer are not the same urgency, and the summary
     * should not pretend they are. Every demo this repository builds is named
     * with a "-demo" slug — see scripts/demo-make.mjs — so that is the test.
     *
     * If a real business ever turns up in the demo column, the naming is wrong
     * and that is worth noticing too.
     */
    (s.slug.endsWith("-demo") ? demos : shops).add(s.name);
    real += faults.length;
  }
}

/*
 * A last line, because scrolling nine businesses to work out whether anything
 * needs doing is the reason a checker stops being run.
 */
console.log("=".repeat(66));

if (real === 0) {
  console.log("Nothing silently wrong on any business that is meant to be finished.");
} else {
  console.log(
    shops.size
      ? `Real businesses to look at: ${[...shops].join(", ")}.`
      : "No real business has anything silently wrong.",
  );
  if (demos.size) console.log(`Demos, which only matter when one is being shown: ${[...demos].join(", ")}.`);
  console.log(`${real} thing${real === 1 ? "" : "s"} in total.`);
}

/*
 * Red only for a business somebody is paying us. A demo with no Stripe is
 * worth knowing before a pitch and is not a reason for this to fail every time
 * it is run — which is how the last checker stopped being read.
 */
if (shops.size) process.exitCode = 1;
