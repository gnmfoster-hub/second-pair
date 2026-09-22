/**
 * The walk-through, in the order a new business should do it.
 *
 * The readiness panel answers "what can the assistant not do yet", ordered by
 * what breaks first — right for a business that is running and needs a tidy,
 * and the wrong shape for an owner on their first evening. They need a route:
 * the thing to do now, why, where it is, and the rest in the order that makes
 * each one easier than the last (hours before prices, prices before the team,
 * all of it before trying it as a customer).
 *
 * Every tick is worked out from what is already filled in, never stored. A
 * stored tick drifts — somebody clears their hours and the list still says
 * done — and a walk-through that is wrong about what is finished is worse than
 * none.
 *
 * Pure, so the order and the ticks can be tested without a database.
 */

import type { Capability } from "./readiness";

export type SetupStep = {
  key: string;
  title: string;
  /** Why it matters, in one or two sentences. */
  why: string;
  done: boolean;
  /** What is still missing, when it is not done. */
  todo?: string;
  href: string;
  action: string;
  /** Opens outside the app — the customer's view of the business. */
  external?: boolean;
  /** Worth doing, not needed to be up and running. */
  optional?: boolean;
};

export type SetupFacts = {
  capabilities: Capability[];
  slug: string;
  /** People taking bookings. */
  team: number;
  /** Of those, how many can sign in. */
  canSignIn: number;
  /** Conversations of any kind, ever. */
  conversations: number;
  /** Of those, how many came from the website button. */
  fromWebsite: number;
  /**
   * Whether anybody has looked at how money is taken.
   *
   * "Nothing switched on" and "we decided not to" look identical from here,
   * so the business says which: anything connected, or either switch touched,
   * counts as decided.
   */
  money: { decided: boolean };
  /**
   * Whether an enabled confirmation is written for the business as a whole.
   *
   * Optional, and absence means "do not ask about it". Every caller that has
   * not been updated keeps the list it had rather than growing a step it
   * cannot answer — and a step that cannot be answered ticks itself wrongly,
   * which is the fault this whole file is written to avoid.
   */
  confirmation?: { on: boolean };
  words: { practitioners: string; customers: string };
};

export function ownerSteps(f: SetupFacts): SetupStep[] {
  const cap = (key: string) => f.capabilities.find((c) => c.key === key);
  const ready = (key: string) => cap(key)?.ready ?? true;

  const steps: SetupStep[] = [
    {
      key: "hours",
      title: "Your opening hours",
      why: "Every time the assistant offers is inside these. Days off and holidays go in the diary later.",
      done: ready("hours"),
      todo: cap("hours")?.otherwise,
      href: "/settings",
      action: "Set your hours",
    },
    {
      key: "prices",
      title: "What you charge",
      why: "What lets it put a number on a job instead of handing every price question to you.",
      done: f.team > 0 ? ready("quote") && ready("priced") : false,
      todo: !ready("priced") ? cap("priced")?.otherwise : cap("quote")?.otherwise,
      href: "/settings/pricing",
      action: "Add your prices",
    },
    {
      key: "team",
      title: `Your ${f.words.practitioners}`,
      why:
        "Everybody who takes bookings, with their own hours. Give each a sign-in and they see their own day and connect their own phone.",
      done: f.team > 0,
      todo:
        f.team === 0
          ? "Nobody is taking bookings yet, so nothing can be booked."
          : undefined,
      href: "/settings/artists",
      action: f.team === 0 ? "Add yourself" : "Check the team",
    },
    {
      key: "paid",
      title: "Getting paid",
      why:
        "Deposits hold a slot, and payment links let people pay on their phone. Money goes straight to your own Stripe, never through us.",
      /*
       * A business that has not decided yet is not finished.
       *
       * This ticked itself for anybody taking neither deposits nor payments,
       * because nothing was broken — which is true of a business that has
       * decided to take money in person, and untrue of one that has not
       * looked. On the first evening it is the second, and a ticked step is
       * how somebody never finds the thing that would have let a customer pay
       * a deposit at midnight.
       */
      done: f.money.decided && ready("stripe") && ready("policy"),
      todo: !f.money.decided
        ? "Nothing is set up to take money yet: deposits are off, payments in full are off, and there is no Stripe account. That is a fine answer if you take cash or a card machine; it is worth one look either way."
        : !ready("stripe")
          ? cap("stripe")?.otherwise
          : cap("policy")?.otherwise,
      // Getting paid has a page of its own now, which is where this sends them.
      href: !ready("stripe") ? cap("stripe")?.href ?? "/settings/money" : "/settings/money",
      action: !f.money.decided
        ? "Decide how you take money"
        : !ready("stripe")
          ? cap("stripe")?.action || "Look at payments"
          : "Write the policy",
    },
    {
      key: "faqs",
      title: "Your usual questions",
      why: "Parking, aftercare, what to bring. Three or four answers stop most of the messages that would come to you.",
      done: ready("faqs"),
      todo: cap("faqs")?.otherwise,
      href: "/settings/faqs",
      action: "Answer a few",
    },
    /*
     * Telling somebody their booking went through.
     *
     * Optional rather than required, deliberately. It is the first thing a
     * customer expects and the businesses already running have lived without
     * it, so making it required would take every one of them from finished to
     * unfinished overnight for something that was not on the list when they
     * did it. Optional says "worth doing" without rewriting their history.
     */
    ...(f.confirmation
      ? [
          {
            key: "confirm",
            title: `Confirm the booking to your ${f.words.customers}`,
            why:
              "A message as soon as they book, saying what they have booked and when. It is the thing people look for straight after, and without it the quiet reads as nothing having happened.",
            done: f.confirmation.on,
            todo: "Nothing goes out when somebody books, so the only thing confirming it is your diary.",
            href: "/settings/reminders",
            action: "Write the confirmation",
            optional: true,
          },
        ]
      : []),
    {
      key: "try",
      title: `Try it as one of your ${f.words.customers}`,
      why: "Ask it a price, ask for Saturday, ask something awkward. What it gets wrong tells you what to fill in.",
      done: f.conversations > 0,
      todo: "Nobody has spoken to it yet, and you should be first.",
      href: `/widget/${f.slug}`,
      action: "Open your assistant",
      external: true,
    },
    {
      key: "told",
      title: "Your phone buzzes when somebody books",
      why: "Done on the phone itself: open this app on it, add it to the home screen, and turn notifications on.",
      done: ready("phone"),
      todo: cap("phone")?.otherwise,
      href: "/settings/you",
      action: "Turn it on",
    },
    {
      key: "website",
      title: "Where people find you",
      why: "The button on your website, and a link for your bio and your texts. This is when real enquiries start arriving.",
      done: ready("widget") && f.fromWebsite > 0,
      todo: !ready("widget")
        ? cap("widget")?.otherwise
        : "Nobody has used the website button yet. Once it is on your site this ticks itself.",
      href: "/settings/install",
      action: "Get your button and link",
    },
    {
      key: "privacy",
      title: "Your privacy notice",
      why: "A link the assistant can give when somebody asks how their details are used.",
      done: ready("privacy"),
      todo: cap("privacy")?.otherwise,
      href: "/settings",
      action: "Add the link",
      optional: true,
    },
  ];

  return steps;
}

export type StaffFacts = {
  firstName: string;
  /** Whether the business pays each person into their own account. */
  ownAccount: boolean;
  stripeConnected: boolean;
  /** Whether connecting Stripe is possible here at all. */
  canConnect: boolean;
  phoneSignedUp: boolean;
  /** The business looks after their hours and prices for them. */
  managed: boolean;
  personalCalendar: boolean;
  slug: string;
  handle: string | null;
};

/** The short version, for somebody on the team rather than the owner. */
export function staffSteps(f: StaffFacts): SetupStep[] {
  const steps: SetupStep[] = [
    {
      key: "told",
      title: "Your phone buzzes when you are booked",
      why: "Open this app on your phone, add it to the home screen, and turn notifications on. It is per phone.",
      done: f.phoneSignedUp,
      todo: "No phone of yours is signed up yet.",
      href: "/settings/you",
      action: "Turn it on",
    },
  ];

  /*
   * Hours and rates are not a step. There is no telling whether somebody has
   * checked theirs, and a tick that is always on is a lie on a list whose
   * whole value is that the ticks are true. The page says where they are.
   */

  if (f.ownAccount && f.canConnect) {
    steps.push({
      key: "stripe",
      title: "Your own Stripe",
      why: "Your deposits and payments land in your account. Stripe asks for your ID and bank details, so only you can do this.",
      done: f.stripeConnected,
      todo: "Not connected, so money for your work cannot be taken yet.",
      href: "/settings/you",
      action: "Connect my Stripe",
    });
  }

  steps.push({
    key: "calendar",
    title: "Your own calendar",
    why: "Link your personal calendar so the assistant never books you over the school run.",
    done: f.personalCalendar,
    todo: "Not linked.",
    href: "/settings/you",
    action: "Link it",
    optional: true,
  });

  return steps;
}

/** How far along, counting only what is needed. */
export function progressOf(steps: SetupStep[]): { done: number; of: number; next: SetupStep | null } {
  const needed = steps.filter((s) => !s.optional);
  return {
    done: needed.filter((s) => s.done).length,
    of: needed.length,
    next: steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done) ?? null,
  };
}
