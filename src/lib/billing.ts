/**
 * What a business owes for a month, and what that month cost us.
 *
 * Kept pure and alone in its file, because it is the arithmetic behind an
 * invoice: it has to be readable by somebody checking a figure a customer has
 * queried, and testable without a database anywhere near it.
 *
 * Everything is pence. Nothing here uses a floating point number for money.
 */

export type Plan = {
  /** What they pay every month whatever they use. */
  planPence: number;
  /** Texts the monthly price covers. Null means unlimited. */
  textsIncluded: number | null;
  /** What each text past the bundle costs them. */
  overagePence: number;
  /**
   * What their website costs them each month, if they have bought one.
   *
   * Zero for every business today. An add-on rather than a tier, so it is a
   * second yes on top of the plan they have already agreed to rather than a
   * move off it — easier to sell, and much easier to stop selling.
   *
   * Optional so that every caller written before this carries on working and
   * every test written before it still describes the same bill.
   */
  websitePence?: number;
};

export type Used = {
  /** Texts we sent on their behalf: replies and reminders. */
  textsOut: number;
  /** Texts their customers sent in. Costs us money, and is not billed on. */
  textsIn: number;
  emailsOut: number;
  /** What the model charged, in millionths of a pound. */
  modelMicros: number;
};

export type Line = { what: string; detail: string; pence: number };

/** What the standard plan covers when nobody has said otherwise. */
export const DEFAULT_PLAN: Plan = { planPence: 3900, textsIncluded: 300, overagePence: 8 };

/**
 * The bill.
 *
 * A bundle is counted on texts we send, not on texts their customers send in.
 * Charging somebody for a message they received is the sort of line that
 * turns a renewal into an argument, and inbound is a fifth of the price
 * anyway.
 */
export function billFor(plan: Plan, used: Used): { lines: Line[]; totalPence: number } {
  const lines: Line[] = [
    {
      what: "Monthly plan",
      detail:
        plan.textsIncluded == null
          ? "texts included"
          : `${plan.textsIncluded.toLocaleString()} texts included`,
      pence: plan.planPence,
    },
  ];

  /*
   * Its own line, not folded into the plan.
   *
   * A business looking at an invoice should be able to see what it is paying
   * for the thing it can point at, and stop paying for it without touching
   * anything else. A single larger "monthly plan" figure hides both.
   */
  if ((plan.websitePence ?? 0) > 0) {
    lines.push({
      what: "Website",
      detail: "hosted and looked after",
      pence: plan.websitePence ?? 0,
    });
  }

  const over = plan.textsIncluded == null ? 0 : Math.max(0, used.textsOut - plan.textsIncluded);
  if (over > 0) {
    lines.push({
      what: "Extra texts",
      detail: `${over.toLocaleString()} past the bundle at ${plan.overagePence}p`,
      pence: over * plan.overagePence,
    });
  }

  return { lines, totalPence: lines.reduce((t, l) => t + l.pence, 0) };
}

/** How many texts are left before they start paying by the message. */
export function textsLeft(plan: Plan, used: Used): number | null {
  if (plan.textsIncluded == null) return null;
  return Math.max(0, plan.textsIncluded - used.textsOut);
}

import { CALL_RATES, type CallRates } from "./voice/callCost.ts";

/** Rates we are charged. Pence, except the model, which is measured. */
export type Rates = {
  smsOutPence: number;
  smsInPence: number;
  emailPence: number;
  numberPence: number;
  /** Per twenty-four-hour conversation, which is how Meta bills. */
  metaConversationPence: number;
  /**
   * The telephone, which bills four things at once. See callCost.
   *
   * Published list prices rather than invoiced ones, so anything worked out
   * from them is marked as an estimate wherever it is shown.
   */
  call: CallRates;
};

export const RATES: Rates = {
  smsOutPence: 4,
  smsInPence: 0.75,
  emailPence: 0.03,
  numberPence: 100,
  /*
   * Meta charges per twenty-four-hour conversation, not per message, and only
   * for some kinds of conversation. Nothing is live on it yet, so this is zero
   * rather than a guess: a made-up rate in a margin is worse than a gap,
   * because a gap is visible. Set it the day the first Meta invoice arrives.
   */
  metaConversationPence: 0,
  call: CALL_RATES,
};

export type ChannelUse = {
  out: number;
  in: number;
  windows: number;
  micros: number;
  /*
   * The telephone only, and already rounded up per call.
   *
   * Every carrier bills whole minutes per leg, so the rounding has to happen
   * on each call and not on the month's total — a hundred fifteen-second rings
   * is a hundred minutes, not twenty-five. Rounding at the end would understate
   * the dearest channel by four times, which is precisely the number this
   * exists to get right.
   */
  calls?: number;
  connectedMinutes?: number;
  forwardedMinutes?: number;
  recordedMinutes?: number;
  transcribedMinutes?: number;
};

export type ChannelCost = {
  channel: string;
  /** What the messages themselves cost — texts, or a Meta conversation. */
  carriagePence: number;
  /** What the model charged answering on this channel. */
  modelPence: number;
  pence: number;
  out: number;
  in: number;
  windows: number;
  /** Said out loud where a rate is not known yet rather than quietly zero. */
  unpriced: boolean;
  /**
   * Worked out from published prices rather than an invoice.
   *
   * True for the telephone until a Twilio bill with calls on it has been typed
   * in. A figure of roughly the right size, marked as roughly, beats a
   * confident zero — but it must not be quoted at a customer as fact.
   */
  estimated?: boolean;
  /** Calls, for the telephone. Nothing for any other channel. */
  calls?: number;
};

/**
 * What each channel cost, so a spike has somewhere to show itself.
 *
 * Texts are charged per message, Meta per conversation, email per thousand,
 * and the website costs nothing to carry at all — its whole cost is the model.
 * Adding them together and calling it "messaging" hides the only fact worth
 * having: which channel is expensive, and therefore what a channel is worth
 * charging for.
 */
export function costByChannel(
  by: Record<string, ChannelUse> | null | undefined,
  rates: Rates = RATES,
): ChannelCost[] {
  const out: ChannelCost[] = [];

  for (const [channel, use] of Object.entries(by ?? {})) {
    let carriage = 0;
    let unpriced = false;

    if (channel === "sms") {
      carriage = use.out * rates.smsOutPence + use.in * rates.smsInPence;
    } else if (channel === "email") {
      carriage = (use.out + use.in) * rates.emailPence;
    } else if (channel === "whatsapp" || channel === "instagram") {
      carriage = use.windows * rates.metaConversationPence;
      unpriced = rates.metaConversationPence === 0 && use.windows > 0;
    } else if (channel === "voice") {
      /*
       * Four meters, not one. The leg in, the leg out to the owner's mobile,
       * the recording and the transcription — and the leg out is six times the
       * leg in, which is why a missed call costs more than a dozen texts
       * before anybody has said a word.
       */
      carriage =
        (use.connectedMinutes ?? 0) * rates.call.inPence +
        (use.forwardedMinutes ?? 0) * rates.call.outPence +
        (use.recordedMinutes ?? 0) * rates.call.recordingPence +
        (use.transcribedMinutes ?? 0) * rates.call.transcriptionPence;
    }
    // The website carries nothing of its own here: its whole cost is the model.

    const modelPence = use.micros / 10_000;
    out.push({
      channel,
      carriagePence: carriage,
      modelPence,
      pence: carriage + modelPence,
      out: use.out,
      in: use.in,
      windows: use.windows,
      unpriced,
      estimated: channel === "voice" && carriage > 0,
      calls: use.calls,
    });
  }

  return out.sort((a, b) => b.pence - a.pence || a.channel.localeCompare(b.channel));
}

/** The same across several businesses, for "where is the money going". */
export function addUpChannels(all: (Record<string, ChannelUse> | null | undefined)[]): ChannelCost[] {
  const total: Record<string, ChannelUse> = {};

  for (const one of all) {
    for (const [channel, use] of Object.entries(one ?? {})) {
      const found = (total[channel] ??= { out: 0, in: 0, windows: 0, micros: 0 });
      found.out += use.out;
      found.in += use.in;
      found.windows += use.windows;
      found.micros += use.micros;
      found.calls = (found.calls ?? 0) + (use.calls ?? 0);
      found.connectedMinutes = (found.connectedMinutes ?? 0) + (use.connectedMinutes ?? 0);
      found.forwardedMinutes = (found.forwardedMinutes ?? 0) + (use.forwardedMinutes ?? 0);
      found.recordedMinutes = (found.recordedMinutes ?? 0) + (use.recordedMinutes ?? 0);
      found.transcribedMinutes = (found.transcribedMinutes ?? 0) + (use.transcribedMinutes ?? 0);
    }
  }

  return costByChannel(total);
}

/**
 * What the month cost us to serve them — everything that scales with one
 * business, and nothing that does not. The shared bill is company-wide and is
 * accounted for separately, because dividing it by however many businesses
 * there happen to be makes every business's margin move when a new one signs
 * up, which is nonsense.
 */
export function costOfServing(used: Used, rates: Rates = RATES): number {
  return Math.round(
    used.modelMicros / 10_000 +
      used.textsOut * rates.smsOutPence +
      used.textsIn * rates.smsInPence +
      used.emailsOut * rates.emailPence +
      rates.numberPence,
  );
}

/** Taken, minus what it cost. Negative is a business we are paying to keep. */
export function marginOf(billedPence: number, costPence: number): { pence: number; percent: number } {
  const pence = billedPence - costPence;
  return { pence, percent: billedPence > 0 ? Math.round((pence / billedPence) * 100) : 0 };
}

/**
 * The month a date falls in, as the first of it.
 *
 * Every usage row is filed under this, so "September" means one thing
 * everywhere and a bill can be rebuilt months later without re-reading
 * messages that data retention has since thrown away.
 */
export function monthOf(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** The month before that one, for "last month's bill". */
export function monthBefore(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

/** "September 2026", for a heading. */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
