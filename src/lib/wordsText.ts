import type { Vocabulary } from "./verticals.ts";

/**
 * The words half of wordsFor, with nothing heavy behind it.
 *
 * Screens in the browser need to capitalise a word or pick "What they had"
 * over "What was done"; they do not need all thirty-four trade packs shipped
 * to a phone to do it. The packs stay on the server in words.ts, which hands
 * the finished words down.
 */
export type Words = Vocabulary & {
  /** The trade's family: "Hair and beauty", "Trades and home". */
  category: string;
  /** "clients", "patients", "pupils". */
  customers: string;
  /** The first of the trade's own services, for an example that sounds like them. */
  exampleService: string;
  /** Something this kind of business might sell over the counter. */
  exampleProduct: string;
  /** Something this kind of business might need to order in. */
  exampleSupplies: string;
  /** How the price list is described in an example: "a £45 cut", "a £120 boiler service". */
  examplePrice: string;
};

export function plural(word: string): string {
  const w = word.trim();
  if (!w) return w;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  return `${w}s`;
}

export function capital(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/** "What they had" where somebody comes in for a treatment; "What was done" for a job. */
export function whatTheyHad(words: Pick<Words, "category">): string {
  return words.category === "Hair and beauty" || words.category === "Health and wellbeing" || words.category === "Pets"
    ? "What they had"
    : "What was done";
}
