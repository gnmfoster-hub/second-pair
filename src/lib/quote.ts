import type { Artist, PriceBand, DepositRule } from "./types";

/** Hours in a studio "day" for day-rate purposes. */
export const FULL_DAY_HOURS = 6;

/** Quotes are rounded to this, so clients never see "£287.50". */
const ROUND_TO_PENCE = 500;

const floorTo = (pence: number, step: number) => Math.floor(pence / step) * step;
const ceilTo = (pence: number, step: number) => Math.ceil(pence / step) * step;

/**
 * Cost of a number of hours with one artist.
 * If the artist has a day rate and the work runs a full day or more, the client
 * gets whichever is cheaper. That is how studios actually pitch a day rate.
 */
function costForHours(artist: Artist, hours: number): number {
  const hourly = Math.round(artist.hourly_rate_pence * hours);
  if (artist.day_rate_pence != null && hours >= FULL_DAY_HOURS) {
    const days = Math.ceil(hours / FULL_DAY_HOURS);
    return Math.min(hourly, days * artist.day_rate_pence);
  }
  return hourly;
}

export type Quote = {
  low_pence: number;
  high_pence: number;
  /** True when the band's low end fell below the artist's minimum charge. */
  hit_minimum: boolean;
};

/** True when this band is priced flat rather than by the hour. */
export const isFixedPrice = (band: PriceBand) => band.price_low_pence != null;

/**
 * Estimate for a size band with a given artist.
 *
 * A band with a price set is that price — no rounding, no minimum charge, no
 * day rate. Those exist to protect an hourly rate, and applying them to a
 * flat-price service would quietly change a number the owner typed in.
 *
 * Otherwise: hours × the hourly rate, floored at the minimum charge.
 */
export function quoteForBand(artist: Artist, band: PriceBand): Quote {
  if (band.price_low_pence != null) {
    return {
      low_pence: band.price_low_pence,
      high_pence: band.price_high_pence ?? band.price_low_pence,
      hit_minimum: false,
    };
  }

  const rawLow = costForHours(artist, band.hours_low);
  const rawHigh = costForHours(artist, band.hours_high);

  let low = Math.max(floorTo(rawLow, ROUND_TO_PENCE), artist.min_charge_pence);
  const high = Math.max(ceilTo(rawHigh, ROUND_TO_PENCE), low);

  const hitMinimum = rawLow < artist.min_charge_pence;
  if (hitMinimum) low = artist.min_charge_pence;

  return { low_pence: low, high_pence: high, hit_minimum: hitMinimum };
}

/**
 * The range across every active artist who could take the work. Used when the
 * client has not picked an artist yet.
 */
export function quoteForStudio(artists: Artist[], band: PriceBand): Quote | null {
  const quotes = artists.filter((a) => a.active).map((a) => quoteForBand(a, band));
  if (quotes.length === 0) return null;
  return {
    low_pence: Math.min(...quotes.map((q) => q.low_pence)),
    high_pence: Math.max(...quotes.map((q) => q.high_pence)),
    hit_minimum: quotes.some((q) => q.hit_minimum),
  };
}

/** Deposit owed against a quote, per the studio's rule. */
export function depositFor(rule: DepositRule, quote: Quote): number {
  if (rule.type === "fixed") return rule.amount_pence;
  const pct = Math.round((quote.low_pence * rule.percent) / 100);
  return Math.max(ceilTo(pct, ROUND_TO_PENCE), rule.min_pence);
}

export function describeDepositRule(rule: DepositRule): string {
  if (rule.type === "fixed") {
    return `£${(rule.amount_pence / 100).toFixed(0)} fixed`;
  }
  return `${rule.percent}% of the estimate, minimum £${(rule.min_pence / 100).toFixed(0)}`;
}

// ---------------------------------------------------------------- VAT

export type VatSettings = {
  vat_registered: boolean;
  vat_rate_percent: number;
  prices_include_vat: boolean;
};

/**
 * What a customer should actually be told.
 *
 * A business not registered says nothing about VAT at all — mentioning it when
 * you are not registered is misleading. A registered business either quotes a
 * number that already contains VAT, or one that does not and must say so.
 */
export function withVat(
  quote: Quote,
  vat: VatSettings,
): { low_pence: number; high_pence: number; note: string } {
  if (!vat.vat_registered) {
    return { low_pence: quote.low_pence, high_pence: quote.high_pence, note: "" };
  }

  if (vat.prices_include_vat) {
    return {
      low_pence: quote.low_pence,
      high_pence: quote.high_pence,
      note: "including VAT",
    };
  }

  // Entered ex-VAT: the customer-facing figure is the one with VAT on it.
  const multiplier = 1 + vat.vat_rate_percent / 100;
  return {
    low_pence: Math.round(quote.low_pence * multiplier),
    high_pence: Math.round(quote.high_pence * multiplier),
    note: `including VAT at ${vat.vat_rate_percent}%`,
  };
}
