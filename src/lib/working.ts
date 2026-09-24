/**
 * Is it all actually working?
 *
 * Giles: "i think we need to look at how everything is set up, its all quite
 * muddled and all over the place, its very hard to check everything is working
 * from a user perspective."
 *
 * He is right, and the cause is not the screens. Each one is sensible on its
 * own. The cause is that one capability's life is spread across four places in
 * four different shapes, and nothing anywhere shows the whole chain for any one
 * of them:
 *
 *   sold        channels_allowed is an array, receptionist_allowed a boolean,
 *               marketing two booleans, both-channels a third, the text
 *               ceiling a number. Five shapes for one idea.
 *   switched on receptionist_on on the business, voice_on on a person,
 *               own_channels on a person, voicemail on the business.
 *   connected   rows in channel_connections.
 *   proven      nowhere at all.
 *
 * So "has Aisha got a Receptionist and will it work" was four lookups in four
 * places, and until this week one of those links had no screen. That is also
 * why the bugs were the shape they were: when state lives in four places,
 * nothing can check itself.
 *
 * This is the one view. Every capability as a chain, the first broken link
 * named, and what a customer gets instead while it is broken — because
 * "not connected" is a fact and "anybody who rings is told it takes texts
 * only" is a reason to do something about it.
 *
 * Pure. The page gathers the facts; every judgement is here and tested,
 * including the awkward combinations that are hard to make by hand.
 */

/** The four questions, in the order they have to be answered. */
export type Link = "sold" | "on" | "connected" | "proven";

export type Step = {
  link: Link;
  /** Unknowable or not applicable is its own answer, never a quiet yes. */
  state: "yes" | "no" | "na";
  /** What we actually found, in a few words. */
  detail?: string;
};

export type Thing = {
  key: string;
  name: string;
  /** What it does, said as the thing rather than as a setting. */
  what: string;
  steps: Step[];
  /** The first link that is broken, or null when the chain holds. */
  stuckAt: Link | null;
  /** What happens instead, while it is broken. */
  because: string | null;
  fix: { href: string; label: string } | null;
  /**
   * Where this thing is controlled, always — not only when it is broken.
   *
   * Giles: "it is still very confusing i need to work out a way of making it
   * easier to understand whats going on with everything and where everything
   * is located."
   *
   * That is the other half of the question and the half nothing answered. A
   * capability is set in two or three places by two or three different people,
   * and knowing it works is no help at all if changing it means guessing which
   * screen. So every row carries its own map.
   */
  where: Where[];
};

/** One place a thing is controlled, and whose screen that is. */
export type Where = {
  /** us = the back office, owner = their settings, person = one of the team. */
  who: "us" | "owner" | "person";
  what: string;
  href: string;
};

export type Facts = {
  /** channels_allowed. "web" is always on. */
  sold: string[];
  receptionistAllowed: boolean;
  receptionistOn: boolean;
  people: { name: string; voiceOn: boolean; hasOwnLine: boolean }[];
  /** Live connections by channel. */
  connected: Record<string, number>;
  /** Whether a text can physically leave the building right now. */
  smsConfigured: boolean;
  emailWorks: boolean;
  stripeReady: boolean;
  voicemailOn: boolean;
  reminderTemplates: number;
  hasConfirmation: boolean;
  /** People whose clients are sent nothing. See reminderCover. */
  uncovered: string[];
  reviewLink: boolean;
  marketingSold: boolean;
  optedIn: number;
  savedMessages: number;
  /** What has actually happened, which is the only proof there is. */
  ever: {
    textDelivered: boolean;
    emailDelivered: boolean;
    callTaken: boolean;
    webChat: boolean;
    paymentTaken: boolean;
    reminderSent: boolean;
    confirmationSent: boolean;
    reviewAsked: boolean;
    campaignSent: boolean;
    formSigned: boolean;
    messageByHand: boolean;
  };
};

const yes = (link: Link, detail?: string): Step => ({ link, state: "yes", detail });
const no = (link: Link, detail?: string): Step => ({ link, state: "no", detail });
const na = (link: Link, detail?: string): Step => ({ link, state: "na", detail });

/**
 * The first link that is broken.
 *
 * "na" is not broken — a thing with nothing to switch on is not stuck at the
 * switch. And nothing past the first break is worth reporting: a business with
 * no number does not need telling that no text has ever been delivered.
 */
function firstBreak(steps: Step[]): Link | null {
  return steps.find((s) => s.state === "no")?.link ?? null;
}

export function assess(f: Facts): Thing[] {
  const has = (channel: string) => f.sold.includes(channel);
  const live = (channel: string) => (f.connected[channel] ?? 0) > 0;

  const things: Thing[] = [];

  /* ------------------------------------------------------------- website */
  things.push(
    build({
      key: "web",
      name: "The assistant on your website",
      what: "Answers while you work, day and night.",
      steps: [
        yes("sold", "Always included"),
        na("on"),
        live("web") || f.ever.webChat ? yes("connected", "On your site") : no("connected"),
        f.ever.webChat ? yes("proven", "Somebody has used it") : no("proven"),
      ],
      because: {
        connected: "The code is not on your website yet, so nobody can reach it there.",
        proven: "Nobody has used it yet. Worth trying it yourself from your own site.",
      },
      fix: { href: "/settings/install", label: "Channels" },
      where: [{ who: "owner", what: "The code and how it looks", href: "/settings/install" }],
    }),
  );

  /* --------------------------------------------------------------- texts */
  if (has("sms")) {
    const number = live("sms");
    things.push(
      build({
        key: "sms",
        name: "Text messages",
        what: "The only way to reach somebody who has not written to you first.",
        steps: [
          yes("sold"),
          na("on"),
          number ? yes("connected", "A number of your own") : no("connected"),
          !f.smsConfigured
            ? no("proven", "Texting is not switched on at our end")
            : f.ever.textDelivered
              ? yes("proven", "Texts have arrived")
              : no("proven"),
        ],
        because: {
          connected: "You have no number, so no text can be sent and no reminder can go.",
          proven: f.smsConfigured
            ? "No text has ever been delivered. Until one has, this is untested."
            : "Texting is not switched on at our end. That one is ours — tell us.",
        },
        fix: { href: "/settings/install", label: "Channels" },
        where: [{ who: "us", what: "Whether they have texts at all", href: "/admin" }, { who: "owner", what: "The number, and who on the team has one", href: "/settings/install" }],
      }),
    );
  }

  /* ------------------------------------------ calls + voicemail response */
  if (has("voice")) {
    things.push(
      build({
        key: "voice",
        name: "Calls and the voicemail response",
        what: "Your phone rings first. What you miss is texted back, or they leave a message that is written down and answered.",
        steps: [
          yes("sold"),
          f.voicemailOn ? yes("on", "Messages can be left") : na("on", "Texting back only"),
          live("sms") ? yes("connected", "On your number") : no("connected"),
          f.ever.callTaken ? yes("proven", "Calls have come through") : no("proven"),
        ],
        because: {
          connected: "There is no number for anybody to ring.",
          proven:
            "No call has ever reached us. If people are ringing and nothing appears, the voice webhook is missing at the phone company — that is the quiet one: texts work and every missed call goes nowhere.",
        },
        fix: { href: "/settings/install", label: "Channels" },
        where: [{ who: "us", what: "Whether calls are on their plan", href: "/admin" }, { who: "owner", what: "Where it rings first, and the voicemail response", href: "/settings/install" }],
      }),
    );
  }

  /* -------------------------------------------------------- receptionist */
  if (f.receptionistAllowed) {
    const onFor = [
      ...(f.receptionistOn ? ["your own line"] : []),
      ...f.people.filter((p) => p.voiceOn).map((p) => p.name),
    ];
    const missingLine = f.people.filter((p) => p.voiceOn && !p.hasOwnLine).map((p) => p.name);

    things.push(
      build({
        key: "receptionist",
        name: "Receptionist",
        what: "A line that picks up and talks, rather than texting back.",
        steps: [
          yes("sold", "Charged for each line"),
          onFor.length ? yes("on", `On for ${listOf(onFor)}`) : no("on"),
          missingLine.length
            ? no("connected", `${listOf(missingLine)} has no number of their own`)
            : onFor.length
              ? yes("connected")
              : na("connected"),
          /*
           * Never claimed. The agent that does the talking is not built, so
           * nothing has answered a call and saying otherwise would be the one
           * lie this page cannot afford.
           */
          na("proven", "Not live yet — the talking part is still being built"),
        ],
        because: {
          on: "Sold, but nobody has it switched on, so nothing is running and nothing is being charged for.",
          connected: "Switched on for somebody with no number of their own, so there is nothing for it to answer.",
        },
        fix: { href: "/settings/artists", label: "Team" },
        where: [{ who: "us", what: "Sold, in the account panel", href: "/admin" }, { who: "owner", what: "On for the business’s own line", href: "/settings/install" }, { who: "person", what: "On for one person, on their card", href: "/settings/artists" }],
      }),
    );
  }

  /* --------------------------------------------------------------- email */
  if (has("email")) {
    things.push(
      build({
        key: "email",
        name: "Email",
        what: "What arrives at your enquiry address is answered like everything else.",
        steps: [
          yes("sold"),
          na("on"),
          f.emailWorks ? yes("connected") : no("connected", "Sending is refused at our end"),
          f.ever.emailDelivered ? yes("proven", "Email has gone out") : no("proven"),
        ],
        because: {
          connected: "Email cannot leave the building. That one is ours — tell us.",
          proven: "No email has ever been delivered, so this is untested.",
        },
        fix: { href: "/settings/install", label: "Channels" },
        where: [{ who: "us", what: "Whether email is on their plan", href: "/admin" }, { who: "owner", what: "The address people write to", href: "/settings/install" }],
      }),
    );
  }

  /* ----------------------------------------------------- confirmations */
  things.push(
    build({
      key: "confirmation",
      name: "Booking confirmations",
      what: "Sent the moment somebody books, with everything they need.",
      steps: [
        yes("sold", "Included"),
        f.hasConfirmation ? yes("on", "Written") : no("on"),
        na("connected"),
        f.ever.confirmationSent ? yes("proven", "Confirmations have gone") : no("proven"),
      ],
      because: {
        on: "You have no confirmation written, so nobody is told their booking is in.",
        proven: "Nothing has been confirmed yet.",
      },
      fix: { href: "/settings/reminders", label: "Confirmations and reminders" },
      where: [{ who: "owner", what: "What it says and how it goes", href: "/settings/reminders" }],
    }),
  );

  /* --------------------------------------------------------- reminders */
  things.push(
    build({
      key: "reminders",
      name: "Reminders",
      what: "Sent before an appointment, so fewer people forget.",
      steps: [
        yes("sold", "Included"),
        f.reminderTemplates > 0
          ? f.uncovered.length
            ? no("on", `Nothing goes to ${listOf(f.uncovered)}'s clients`)
            : yes("on", `${f.reminderTemplates} written`)
          : no("on"),
        na("connected"),
        f.ever.reminderSent ? yes("proven", "Reminders have gone") : no("proven"),
      ],
      because: {
        on: f.reminderTemplates
          ? "Some of your people send nothing at all before an appointment."
          : "No reminder is written, so nobody is reminded of anything.",
        proven: "No reminder has ever been sent.",
      },
      fix: { href: "/settings/reminders", label: "Confirmations and reminders" },
      where: [{ who: "owner", what: "What they say and when", href: "/settings/reminders" }, { who: "person", what: "Whether somebody sends their own", href: "/settings/artists" }],
    }),
  );

  /* ----------------------------------------------------------- reviews */
  things.push(
    build({
      key: "reviews",
      name: "Review requests",
      what: "Asked afterwards, once, of people who actually turned up.",
      steps: [
        yes("sold", "Included"),
        f.reviewLink ? yes("on", "Your link is set") : no("on"),
        na("connected"),
        f.ever.reviewAsked ? yes("proven", "Requests have gone") : no("proven"),
      ],
      because: {
        on: "No review link, so nobody is asked and no reviews come in.",
        proven: "Nobody has been asked yet.",
      },
      fix: { href: "/settings/reviews", label: "Review requests" },
      where: [{ who: "owner", what: "The link and the wording", href: "/settings/reviews" }],
    }),
  );

  /* --------------------------------------------------------- marketing */
  if (f.marketingSold) {
    things.push(
      build({
        key: "marketing",
        name: "Marketing",
        what: "Offers and reminders to come back, only to people who asked for them.",
        steps: [
          yes("sold"),
          f.optedIn > 0 ? yes("on", `${f.optedIn} have opted in`) : no("on"),
          na("connected"),
          f.ever.campaignSent ? yes("proven", "Campaigns have gone") : no("proven"),
        ],
        because: {
          on: "Nobody has opted in, so a campaign would reach no one. They are asked when they book.",
          proven: "No campaign has gone out yet.",
        },
        fix: { href: "/settings/marketing", label: "Marketing" },
        where: [{ who: "us", what: "Whether they may run campaigns", href: "/admin" }, { who: "owner", what: "The campaigns themselves", href: "/settings/marketing" }],
      }),
    );
  }

  /* ------------------------------------------------------ taking money */
  things.push(
    build({
      key: "payments",
      name: "Taking payments",
      what: "Deposits and payment links, straight into your own account.",
      steps: [
        yes("sold", "Included"),
        na("on"),
        f.stripeReady ? yes("connected", "Your account is connected") : no("connected"),
        f.ever.paymentTaken ? yes("proven", "Money has gone through") : no("proven"),
      ],
      because: {
        /*
         * Two different sentences, because the chain can genuinely hold a
         * red link above a green one here and that is not a contradiction.
         *
         * Money going through is a fact about the past; a connected account
         * is a fact about now. A business whose Stripe has been disconnected
         * since — or moved, or expired — has taken payments and cannot take
         * another, and the first version of this page showed that as a red
         * "connected" beside a green "proven" with nothing to explain it.
         * That reads as the page being broken rather than the setup.
         */
        connected: f.ever.paymentTaken
          ? "Money has gone through before, but no account is connected now — so nothing can be charged today. Usually means it was disconnected or the connection expired."
          : "No account connected, so nothing can be charged and no deposit can be held.",
        proven: "No payment has gone through yet.",
      },
      fix: { href: "/settings/money", label: "Getting paid" },
      where: [{ who: "owner", what: "Connecting their own account", href: "/settings/money" }],
    }),
  );

  /* --------------------------------------------------- saved messages */
  things.push(
    build({
      key: "saved",
      name: "Saved messages",
      what: "Wordings you pick from when you message somebody yourself.",
      steps: [
        yes("sold", "Included"),
        f.savedMessages > 0 ? yes("on", `${f.savedMessages} saved`) : no("on"),
        na("connected"),
        f.ever.messageByHand ? yes("proven", "You have sent some") : no("proven"),
      ],
      because: {
        on: "Nothing saved, so there is nothing to pick from and every message is typed out.",
        proven: "You have not messaged anybody from their page yet.",
      },
      fix: { href: "/settings/messages", label: "Saved messages" },
      where: [{ who: "owner", what: "The wordings", href: "/settings/messages" }],
    }),
  );

  return things;
}

function build(input: {
  key: string;
  name: string;
  what: string;
  steps: Step[];
  because: Partial<Record<Link, string>>;
  fix: { href: string; label: string };
  where: Where[];
}): Thing {
  const stuckAt = firstBreak(input.steps);
  return {
    key: input.key,
    name: input.name,
    what: input.what,
    steps: input.steps,
    stuckAt,
    because: stuckAt ? (input.because[stuckAt] ?? null) : null,
    fix: stuckAt ? input.fix : null,
    where: input.where,
  };
}

/**
 * What to say at the top, in one line.
 *
 * Counted rather than listed, because the list is directly underneath. The
 * point of the line is whether to read the list at all.
 */
export function summarise(things: Thing[]): string {
  const broken = things.filter((t) => t.stuckAt && t.stuckAt !== "proven");
  const untested = things.filter((t) => t.stuckAt === "proven");

  if (!broken.length && !untested.length) return "Everything you have is set up and has been used.";
  if (!broken.length) {
    return `Everything is set up. ${untested.length} ${untested.length === 1 ? "thing has" : "things have"} never been used, so ${untested.length === 1 ? "it is" : "they are"} untested.`;
  }
  return `${broken.length} ${broken.length === 1 ? "thing needs" : "things need"} something before ${broken.length === 1 ? "it" : "they"} will work.`;
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * And the same question about each person, which the business view cannot ask.
 *
 * Giles: "i think i will need to see what team members havent set up as well,
 * this only covers the business."
 *
 * He is right, and it is the half where things actually go wrong. A business
 * is set up once by somebody who cares; a team of six is set up six times, by
 * six people, over months, and nobody ever looks at all six together. The
 * result is a salon that is correctly configured and has one stylist whose
 * clients are reminded of nothing.
 *
 * Every line is a consequence rather than a missing field, for the same reason
 * as above: "no hourly rate" is a fact and "the assistant cannot quote for her,
 * so it hands every pricing question about her to you" is a reason to fix it.
 */
export type PersonFacts = {
  name: string;
  active: boolean;
  /** A room or a chair rather than somebody. Most of this does not apply. */
  isResource: boolean;
  /** The owner fills this person in; they have no login of their own by design. */
  ownerManaged: boolean;
  hasLogin: boolean;
  /** An address to invite them at. Without one there is nothing to send. */
  invited: boolean;
  hasRate: boolean;
  /** They send their own reminders rather than the shop's. */
  ownReminders: boolean;
  /** Their clients are sent nothing at all. From reminderCover. */
  sendsNothing: boolean;
  /** Channels they are allowed one of their own on. */
  ownChannelsAllowed: string[];
  /** Channels they actually have one on. */
  ownChannelsConnected: string[];
  receptionistOn: boolean;
  hasOwnLine: boolean;
  /** Whether the assistant may put customers in their diary. */
  takesBookings: boolean;
  /** What their calendar last said, when it went wrong. */
  calendarError: string | null;
};

export type PersonNote = {
  /** A fault is something nobody chose. A note is a choice worth seeing. */
  kind: "fault" | "note";
  says: string;
};

export type PersonState = {
  name: string;
  notes: PersonNote[];
};

export function assessPeople(people: PersonFacts[]): PersonState[] {
  return people
    .filter((p) => p.active)
    .map((p) => {
      const notes: PersonNote[] = [];

      /*
       * A room is not a person. Everything below asks about somebody who
       * works here, and a chair with no login is not a problem to solve.
       */
      if (p.isResource) return { name: p.name, notes };

      /*
       * The loudest one, and the one that is always somebody's fault rather
       * than a preference: their clients hear nothing before an appointment.
       */
      if (p.sendsNothing) {
        notes.push({
          kind: "fault",
          says: p.ownReminders
            ? "Sends their own reminders and has not written any, so their clients are reminded of nothing."
            : "Their clients are sent nothing before an appointment.",
        });
      }

      if (p.calendarError) {
        notes.push({
          kind: "fault",
          says: `Their own calendar is failing: ${p.calendarError}. Their outside commitments are not being read, so the assistant can double-book them.`,
        });
      }

      if (p.receptionistOn && !p.hasOwnLine) {
        notes.push({
          kind: "fault",
          says: "Has a Receptionist switched on and no number of their own, so there is nothing for it to answer — and it is still charged for.",
        });
      }

      const missing = p.ownChannelsAllowed.filter((c) => !p.ownChannelsConnected.includes(c));
      if (missing.length) {
        notes.push({
          kind: "note",
          says: `Allowed their own ${listOf(missing)}, but nothing is connected ${missing.length > 1 ? "on any of them" : "on it"} yet.`,
        });
      }

      if (!p.hasRate) {
        notes.push({
          kind: "note",
          says: "No rate of their own, so the assistant quotes the business's prices for them.",
        });
      }

      /*
       * Never invited and never signed in are different problems with
       * different answers, and telling somebody to chase an invitation that
       * was never sent wastes their afternoon.
       */
      if (!p.hasLogin && !p.ownerManaged) {
        notes.push({
          kind: p.invited ? "note" : "fault",
          says: p.invited
            ? "Invited, but has never signed in — so they cannot see their own diary."
            : "No email address, so they have never been invited and cannot sign in at all.",
        });
      }

      if (!p.takesBookings) {
        notes.push({
          kind: "note",
          says: "The assistant never offers them, so customers can only be booked in with them by hand.",
        });
      }

      return { name: p.name, notes };
    })
    /*
     * Whoever needs something first.
     *
     * Roster order is creation order, which puts the person who needs fixing
     * wherever they happen to have been added — and a list you have to read
     * all of is a list nobody reads twice.
     */
    .sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name));
}

function weight(p: PersonState): number {
  if (p.notes.some((n) => n.kind === "fault")) return 2;
  return p.notes.length ? 1 : 0;
}

/** The line at the top of the people list. Faults first, because they are. */
export function summarisePeople(states: PersonState[]): string {
  const faults = states.filter((s) => s.notes.some((n) => n.kind === "fault"));
  const notes = states.filter(
    (s) => !s.notes.some((n) => n.kind === "fault") && s.notes.length > 0,
  );

  if (!states.length) return "Nobody in the diary yet.";
  if (!faults.length && !notes.length) return `All ${states.length} are set up.`;
  if (!faults.length) {
    return `Nothing wrong. ${notes.length} of ${states.length} ${notes.length === 1 ? "has" : "have"} something worth knowing.`;
  }
  return `${listOf(faults.map((f) => f.name))} ${faults.length === 1 ? "has" : "have"} something that needs fixing.`;
}
