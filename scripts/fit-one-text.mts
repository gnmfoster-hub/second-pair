/*
 * Will this reminder fit in one text, for the businesses that actually use it?
 *
 *   npx tsx scripts/fit-one-text.mts
 *
 * The 48 hour reminder runs to 201 characters once filled, so the sender cuts
 * it and the parking and access advice never reaches anybody without an email
 * address. Rewriting it by eye is how you end up two characters over for the
 * one business with a long name, so this measures every candidate against the
 * real names and the longest date the diary produces.
 */
import { segments, renderReminder, forOneText } from "../src/lib/reminderText.ts";

/* The worst realistic filling: a full weekday date, not "tomorrow". */
const WORST_WHEN = "Thursday 17 September at 11:00 am";

const businesses = [
  { business: "Amber's Paws & Pastures", practitioner: "Amber Hurden", name: "Julie" },
  { business: "Neat & Tidy Solutions", practitioner: "Karen Foster", name: "Samantha" },
  { business: "Living Canvas Tattoo", practitioner: "Marika", name: "Lauren" },
  /* A deliberately long one, so the answer holds for the next client too. */
  { business: "Brightwork Plastering & Rendering", practitioner: "Christopher", name: "Alexandra" },
];

const candidates: Record<string, string> = {
  "as it is now":
    "Hi {{name}}, {{practitioner}} from {{business}} is booked to come out to you {{when}}. " +
    "Please make sure there's somewhere to park and access to the work. Need to move it? Just reply here.",

  "shorter advice":
    "Hi {{name}}, {{practitioner}} from {{business}} is booked to come out to you {{when}}. " +
    "Please leave parking and access clear. Reply here to move it.",

  "advice only":
    "Hi {{name}}, {{practitioner}} from {{business}} is coming out to you {{when}}. " +
    "Please leave parking and access clear.",

  "business at the end":
    "Hi {{name}}, {{practitioner}} is coming out to you {{when}}. " +
    "Please leave parking and access clear. {{business}}, reply here to move it.",

  /*
   * Three sentences on purpose. The text keeps as many whole sentences as fit
   * and the email carries the lot, so the question is not "does it all fit"
   * but "does the advice land in the text", which is the sentence somebody
   * actually needs before a visit.
   */
  "shorter opening, advice second":
    "Hi {{name}}, {{practitioner}} from {{business}} is coming {{when}}. " +
    "Please leave parking and access clear. Reply here to move it.",

  "shorter opening, fuller advice":
    "Hi {{name}}, {{practitioner}} from {{business}} is coming {{when}}. " +
    "Please leave somewhere to park and access to the work. Reply here to move it.",
};

for (const [label, template] of Object.entries(candidates)) {
  console.log(`\n${label}`);
  for (const b of businesses) {
    const filled = renderReminder(template, { ...b, when: WORST_WHEN, link: "" });
    const sent = forOneText(filled);
    const whole = sent.trim() === filled.trim();
    console.log(
      `  ${String(filled.length).padStart(3)} chars, ${segments(filled)} segment(s)` +
        `  ${whole ? "arrives whole" : `CUT to ${sent.length}`}   ${b.business}`,
    );
    if (!whole) console.log(`        lost: ${JSON.stringify(filled.trim().slice(sent.length))}`);
  }
}
