/**
 * The terms a business agrees to, and the money on top of them.
 *
 * ⚠ THE WORDING BELOW HAS NOT BEEN REVIEWED BY A SOLICITOR.
 *
 * It is a careful draft, written to be read by a plasterer rather than by a
 * lawyer, and it is not legal advice. Before one of these is sent to somebody
 * who is paying, it wants an hour of a solicitor's time. The parts most worth
 * their attention are marked ★ in the text.
 *
 * Two of them are not style questions:
 *
 *   ★ The data processing agreement. Their customers' names, numbers and
 *     messages flow through this system. That makes them the controller and us
 *     the processor, and UK GDPR Article 28 requires the arrangement to be in
 *     writing with specific things said. Section 6 is an attempt at it. It is
 *     the clause most likely to be skipped and the one that is actually
 *     compulsory.
 *
 *   ★ The notice period. Sixty days is long for a monthly subscription to a
 *     small business. It is enforceable between businesses if it is clearly
 *     presented before signing — which the tick and the signature give — but
 *     whether it is a good idea commercially is Giles's call, not mine.
 *
 * ── Why the text is frozen onto the agreement ───────────────────────────────
 *
 * `buildTerms` returns a string that is written onto the agreement row and
 * never read from here again. Editing this file changes what the next business
 * is sent and nothing about what anybody has already signed — the same rule
 * consent forms follow, and the only reason a signature is worth anything.
 *
 * The version is stamped alongside, so it is always possible to say which
 * wording somebody agreed to without reading the whole thing back.
 */

/** Bump when the wording changes in a way that matters. Stamped on each one. */
export const TERMS_VERSION = "2026-09-draft-1";

export type Period = "monthly" | "quarterly" | "yearly";

/**
 * One priced line of the schedule.
 *
 * Giles, 30 Sep: "the agreement isn't very in depth and should really have
 * separate lines to add services and costs etc."
 *
 * He is right, and a set-up fee plus one recurring figure is not a schedule. A
 * real one for this business is a website built once, an assistant every month,
 * the Receptionist every month, and a bundle of texts on top - four lines, three
 * of them recurring, two different kinds of thing. Rolled into two numbers, the
 * client cannot see what they are paying for and neither can we a year later when
 * they ask why it is thirty-five pounds.
 *
 * `when` is on the line rather than on the agreement, because it genuinely
 * differs per line: a build is once and a subscription is not, and an agreement
 * with both is the ordinary case rather than the awkward one.
 */
export type Line = {
  /** What it is, in the words the client will read. */
  what: string;
  pence: number;
  when: "once" | Period;
};

export type Money = {
  /**
   * The totals, kept because the back office searches and adds them up.
   *
   * Where there are lines these are the sums of them, worked out by whatever is
   * writing the agreement rather than typed twice. Where there are none they are
   * the whole story, which is how every agreement before 30 September worked and
   * still reads correctly.
   */
  setupFeePence: number;
  recurringPence: number;
  period: Period;
  trialEndsOn: string | null;
  noticeDays: number;
  /** "the assistant", "a website" — said in the business's own words. */
  includes: string[];
  /**
   * The schedule, where one was given.
   *
   * Optional on purpose: an agreement written before this existed has none, and
   * must go on rendering exactly as it did. A signature is against a wording, and
   * changing how an old one would render is the one thing this file must never
   * do.
   */
  lines?: Line[];
};

/** What the totals come to, given a schedule. Used by whatever writes one. */
export function totalsFor(lines: Line[]): {
  setupFeePence: number;
  recurringPence: number;
  period: Period;
} {
  const once = lines.filter((l) => l.when === "once");
  const repeating = lines.filter((l) => l.when !== "once");

  /*
   * The period for the totals is whichever the recurring lines share.
   *
   * Where they do not share one - a monthly assistant and a yearly domain - the
   * summed "recurring" figure is not a real number, so the schedule below is the
   * only honest statement of it and the total is left as the monthly part. The
   * columns exist for the back office to sort by, not to be quoted at anybody.
   */
  const periods = [...new Set(repeating.map((l) => l.when as Period))];
  const period: Period = periods.length === 1 ? periods[0] : "monthly";

  return {
    setupFeePence: once.reduce((n, l) => n + l.pence, 0),
    recurringPence: repeating
      .filter((l) => l.when === period)
      .reduce((n, l) => n + l.pence, 0),
    period,
  };
}

const money = (pence: number) =>
  pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;

const PERIOD: Record<Period, string> = {
  monthly: "a month",
  quarterly: "a quarter",
  yearly: "a year",
};

/** "the assistant, a website and the Receptionist" */
function listOf(items: string[]): string {
  if (items.length === 0) return "the services described to you";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The whole document, in the order somebody reads it.
 *
 * Money first, because that is what they are looking for and burying it is how
 * a contract earns its reputation. Then what each side does, then the parts
 * about data and ending it, which are the ones that matter when something goes
 * wrong and the only time anybody reads this again.
 */
export function buildTerms(business: string, m: Money): string {
  const recurring = `${money(m.recurringPence)} ${PERIOD[m.period]}`;

  /*
   * Whether there is an assistant at all.
   *
   * Giles asked for accounts that are "just for a website", and the first
   * draft promised one anyway — every clause about answering enquiries and
   * keeping prices current went out to somebody who had bought a website and
   * nothing else. Caught by its own test.
   *
   * Read from what was sold rather than from a flag, because `includes` is
   * deliberately free text: what is on the agreement is what was sold.
   */
  const hasAssistant = m.includes.some((i) => /assistant|receptionist/i.test(i));

  const lines: string[] = [];

  lines.push(`AGREEMENT BETWEEN SECOND PAIR LTD AND ${business.toUpperCase()}`);
  lines.push("");
  lines.push(
    "Second Pair Ltd is a company registered in England and Wales, company number 17453965.",
  );
  lines.push("");

  lines.push("1. WHAT YOU ARE GETTING");
  lines.push("");
  lines.push(`You are taking on ${listOf(m.includes)}.`);
  lines.push("");
  lines.push(
    hasAssistant
      ? "We set it up with you rather than handing you an empty account: your prices, your hours, your services and the way your assistant speaks are filled in together before anybody uses it."
      : "We build it with you rather than handing you something to fill in yourself: what it says, how it looks and what is on it are agreed together before it goes live.",
  );
  lines.push("");

  lines.push("2. WHAT IT COSTS");
  lines.push("");
  if (m.setupFeePence > 0) {
    lines.push(`Setting up: ${money(m.setupFeePence)}, once, payable before we start.`);
  } else {
    lines.push("Setting up: nothing.");
  }
  lines.push(`Then: ${recurring}.`);
  if (m.trialEndsOn) {
    lines.push("");
    lines.push(
      `You are not charged the ${PERIOD[m.period].replace("a ", "")}ly amount until ${m.trialEndsOn}. If you tell us before that date that you do not want to carry on, you pay nothing further and we will not ask you why.`,
    );
  }
  lines.push("");
  lines.push(
    "Text messages, telephone calls and card processing are charged at what they cost us, shown to you before they start and never marked up without telling you first. Where a limit on texts or calls has been agreed, it is on your account and visible to you.",
  );
  lines.push("");
  lines.push(
    "★ Prices may change with at least one month's notice in writing. If you do not want to continue at a new price, you may end this agreement on the day the new price would start, and the notice period in section 5 does not apply.",
  );
  lines.push("");

  lines.push("3. WHAT WE DO");
  lines.push("");
  lines.push(
    hasAssistant
      ? "We answer enquiries on your behalf, in your name, using the prices and rules you have given us. We will tell you when we cannot answer something and hand it to you rather than guess."
      : "We keep what we have built for you running, and make the changes you ask for within a reasonable time.",
  );
  lines.push("");
  lines.push(
    "We do not promise the service is never unavailable. We do promise to tell you when it is, and not to pretend otherwise on a screen.",
  );
  lines.push("");
  lines.push(
    "★ We are not liable for business you would have had, for a booking made wrongly, or for anything a customer was told by the assistant. Our total liability to you in any twelve months is limited to what you have paid us in that period. Nothing here limits liability for death or personal injury caused by negligence, or for fraud.",
  );
  lines.push("");

  lines.push("4. WHAT YOU DO");
  lines.push("");
  lines.push(
    hasAssistant
      ? "You keep your prices, hours and services up to date, because the assistant answers with what you have given it. You tell us if something it says is wrong."
      : "You tell us when something on it is out of date or wrong, and you own what you ask us to put on it.",
  );
  lines.push("");
  lines.push(
    "You remain responsible for your own business: the work itself, your insurance, your registrations, and anything the law requires of you rather than of us.",
  );
  lines.push("");

  lines.push("5. ENDING IT");
  lines.push("");
  lines.push(
    `★ Either of us may end this agreement by giving ${m.noticeDays} days' notice in writing. You carry on paying, and we carry on working, until that period is up.`,
  );
  lines.push("");
  lines.push(
    "We may stop the service immediately if an invoice is more than thirty days late, or if the service is being used to break the law or to mislead somebody. We will tell you why.",
  );
  lines.push("");
  lines.push(
    "When it ends you can have everything you have put in — your customers, their details, your conversations and your diary — as a file you can open, at no charge. Ask, and it is sent within fourteen days.",
  );
  lines.push("");

  lines.push("6. YOUR CUSTOMERS' INFORMATION ★");
  lines.push("");
  lines.push(
    hasAssistant
      ? "Your customers' names, numbers, addresses and messages pass through our system. In law you are the controller of that information and we are your processor, and this section is the written agreement the UK GDPR requires between us."
      : "Where anything your customers send reaches us through what we have built for you, you are the controller of that information in law and we are your processor, and this section is the written agreement the UK GDPR requires between us.",
  );
  lines.push("");
  lines.push("We will:");
  lines.push(
    "  • use that information only to run the service for you, and only on your instructions;",
  );
  lines.push(
    "  • keep it in the United Kingdom, other than the words of a message, which are sent to Anthropic to be answered and are covered by standard contractual clauses;",
  );
  lines.push(
    "  • allow only the people who need it to see it, each under a duty of confidence;",
  );
  lines.push("  • help you if a customer asks what you hold about them, or asks you to delete it;");
  lines.push("  • tell you without undue delay if that information is ever exposed;");
  lines.push(
    "  • use the processors listed at second-pair.com/privacy, and tell you before adding another;",
  );
  lines.push(
    "  • delete or return it when this agreement ends, other than anything we must keep by law.",
  );
  lines.push("");
  lines.push(
    "Enquiries that never became a booking are deleted after twenty-four months. Anything attached to work you actually did is kept as part of your own records.",
  );
  lines.push("");
  lines.push(
    "★ Registering with the Information Commissioner's Office, and paying the data protection fee where one is due, is yours rather than ours. The ICO has a free five-minute check at ico.org.uk that says whether it applies to you.",
  );
  lines.push("");

  lines.push("7. THE REST");
  lines.push("");
  lines.push(
    "This is the whole agreement between us. Changing it takes both of us agreeing in writing. It is governed by the law of England and Wales.",
  );
  lines.push("");
  lines.push(
    "You are taking this on for your business rather than as a consumer, so the rights a consumer has do not apply.",
  );

  return lines.join("\n");
}
