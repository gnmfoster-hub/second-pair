/**
 * Whether a deposit could actually be taken today, and if not, whose problem
 * it is.
 *
 * The setup checklist has asked one question about money since deposits were
 * built — has the business connected Stripe — and on a salon of chair renters
 * that question is beside the point. There, the shop's account is not where
 * anybody's money goes: each person has their own, and a business that has
 * connected the shop's and switched deposits on reads as ready while every
 * single charge is refused. That is the worst shape a checklist can take,
 * because it is the shape that stops somebody looking.
 *
 * Three different people can be at fault and the fix is different for each:
 * the owner connects the shop's account, a stylist connects her own, or it is
 * ours and nobody in the salon can do anything about it. So this names who.
 *
 * Pure and alias-free on purpose: the test runner cannot resolve `@/`, and
 * this is the sort of branching that is worth pinning down without a database.
 */

export type DepositReadiness = {
  /** Deposits are switched on for the business at all. */
  takesDeposits: boolean;
  /** Whose account the money lands in. */
  model: "business" | "people";
  /** The business has its own Stripe account connected. */
  businessAccount: boolean;
  /**
   * Per-person model: the owner has said a payment may fall back to the
   * business when somebody has no account of their own.
   */
  fallback: boolean;
  /**
   * Per-person model: the people who take deposits and have not connected
   * Stripe. First names, because "Sarah has not connected hers" is a thing
   * somebody can act on this afternoon and "1 person is unconfigured" is not.
   */
  waiting: string[];
  /** Per-person model: how many people take deposits at all. */
  taking: number;
  /**
   * Whether connecting works at our end — the platform key, one value for
   * everybody on here. False makes every other answer moot, so it is asked
   * first.
   */
  platformReady: boolean;
};

export type Verdict = {
  ready: boolean;
  /** What happens instead. Empty when ready. */
  otherwise: string;
  /** The button, when there is something to press. */
  action: string;
  href: string;
  /**
   * Ready, and somebody is still being paid into an account that is not
   * theirs.
   *
   * Its own field rather than a message on a failed check, because a deposit
   * genuinely can be taken — saying otherwise would be crying wolf on the one
   * list that has to stay believable. But a chair renter whose takings land
   * in the shop account is the exact arrangement the per-person model exists
   * to prevent, and nobody would ever find out from a screen that only speaks
   * up when something is broken.
   */
  fallingBack?: string;
};

/** Sarah, or Sarah and Mark, or Sarah, Mark and 2 others. */
export function nameThem(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

export function depositReadiness(state: DepositReadiness): Verdict {
  const settled: Verdict = { ready: true, otherwise: "", action: "", href: "/settings/money" };

  // Nothing to be ready for. A business that does not take deposits is not
  // half-configured, it has decided.
  if (!state.takesDeposits) return settled;

  /*
   * Ours, and said so.
   *
   * Still counted as not ready, because it genuinely is not — the assistant
   * cannot hold a slot with a deposit today. But the line has to say whose
   * fault that is, or an owner spends an evening looking for the setting they
   * have missed. There is no button, because there is nothing for them to
   * press.
   */
  if (!state.platformReady) {
    return {
      ready: false,
      otherwise:
        "Card payments are not switched on at our end yet, so a deposit cannot be " +
        "taken by anybody. That one is on Second Pair rather than on you.",
      action: "",
      href: "/settings/money",
    };
  }

  if (state.model === "business") {
    if (state.businessAccount) return settled;
    return {
      ready: false,
      otherwise:
        "You take deposits but your own Stripe account is not connected, so nobody can pay one.",
      action: "Connect Stripe",
      href: "/settings/money",
    };
  }

  // ──────────────────────────────────────── a Stripe account each, from here

  /*
   * Deposits on at the business, and not one person taking them.
   *
   * Two switches have to agree on this model, and a business can sit with the
   * first on and the second off for everybody — which looks configured from
   * the settings page and takes nothing from anybody.
   */
  if (state.taking === 0) {
    return {
      ready: false,
      otherwise:
        "Money goes to each person here, and nobody is set to take a deposit, so " +
        "the business takes deposits in theory and none in practice.",
      action: "Check who takes them",
      href: "/settings/artists",
    };
  }

  if (state.waiting.length === 0) return settled;

  /*
   * Somebody has nowhere of their own for the money to land.
   *
   * With the fallback on this still works, and saying nothing would be wrong
   * anyway: their deposits are going into the shop's account, which on a
   * chair-rent salon is the arrangement the per-person model exists to
   * prevent. Ready, because a customer can pay; said, because somebody is
   * being paid into somebody else's account.
   */
  if (state.fallback && state.businessAccount) {
    return {
      ready: true,
      otherwise: "",
      action: "",
      href: "/settings/artists",
      fallingBack:
        `${nameThem(state.waiting)} ${state.waiting.length === 1 ? "has" : "have"} no Stripe ` +
        `account of their own, so their deposits land in the business account until ` +
        `they connect one.`,
    };
  }

  return {
    ready: false,
    otherwise:
      `${nameThem(state.waiting)} ${state.waiting.length === 1 ? "takes" : "take"} deposits and ` +
      `${state.waiting.length === 1 ? "has" : "have"} not connected Stripe, so a deposit for ` +
      `their work is refused rather than going somewhere else. Only they can connect it ` +
      `— Stripe asks for their ID and their bank details.`,
    action: "",
    href: "/settings/artists",
  };
}
