import { verticalPack, type Vocabulary } from "./verticals.ts";
import { plural, capital, type Words } from "./wordsText.ts";

export { plural, capital, whatTheyHad, type Words } from "./wordsText.ts";

/**
 * What this business calls things, for any screen that shows words.
 *
 * The assistant has spoken each trade's language since trades existed; the
 * screens mostly did not. A cleaner completing a job was asked "What they
 * had", a tutor searched for "clients" when their word is students, the till
 * suggested "Shampoo, gift voucher" to a plumber, and a note in the diary
 * offered "Order ink and needles" to a physiotherapist. Each screen that did
 * get it right had copied the same line to merge the trade's words with the
 * business's own changes, and twelve copies is how the others were missed.
 *
 * One function, and everything that shows a trade word takes it from here.
 * The business's own overrides win, then the trade's pack, then the neutral
 * defaults inside the pack.
 */
/*
 * Over-the-counter examples by kind of business, and a few trades that sell
 * something particular. Examples only — placeholders and hints — so a close
 * enough word is right and a word from another trade is the thing to avoid.
 */
const PRODUCT_BY_TRADE: Record<string, string> = {
  tattoo: "Aftercare balm",
  barber: "Beard oil",
  nails: "Cuticle oil",
  dog_groomer: "Dog shampoo",
  garage: "Screenwash",
  valeting: "Air freshener",
  photographer: "Extra prints",
  tutor: "Workbook",
  driving_instructor: "Theory test book",
  pt: "Protein bar",
};

const PRODUCT_BY_CATEGORY: Record<string, string> = {
  "Hair and beauty": "Shampoo, 250ml",
  "Health and wellbeing": "Support strap",
  "Trades and home": "Spare parts",
  Pets: "Treats",
  Motoring: "Wiper blades",
  "Everything else": "Gift voucher",
};

const SUPPLIES_BY_TRADE: Record<string, string> = {
  tattoo: "Order ink and needles",
  salon: "Order colour stock",
  mobile_hair: "Order colour stock",
  barber: "Order blades",
  nails: "Order gel stock",
  cleaner: "Order cleaning supplies",
  window_cleaner: "Order cleaning supplies",
  dog_groomer: "Order shampoo",
  garage: "Order parts",
  mobile_mechanic: "Order parts",
};

const SUPPLIES_BY_CATEGORY: Record<string, string> = {
  "Hair and beauty": "Order stock",
  "Health and wellbeing": "Order supplies",
  "Trades and home": "Order materials",
  Pets: "Order supplies",
  Motoring: "Order parts",
  "Everything else": "Order supplies",
};

export function wordsFor(business: {
  vertical?: string | null;
  vocabulary?: Partial<Vocabulary> | null;
}): Words {
  const pack = verticalPack(business.vertical);
  const own = Object.fromEntries(
    Object.entries(business.vocabulary ?? {}).filter(([, v]) => typeof v === "string" && v.trim()),
  ) as Partial<Vocabulary>;
  const words: Vocabulary = { ...pack.vocabulary, ...own };

  const first = pack.bands[0];
  const pounds = first?.price_low_pence != null ? `£${Math.round(first.price_low_pence / 100)} ` : "";

  return {
    ...words,
    category: pack.category,
    customers: plural(words.customer),
    exampleService: first?.size_label ?? capital(words.service),
    exampleProduct: PRODUCT_BY_TRADE[pack.id] ?? PRODUCT_BY_CATEGORY[pack.category] ?? "Gift voucher",
    exampleSupplies:
      SUPPLIES_BY_TRADE[pack.id] ?? SUPPLIES_BY_CATEGORY[pack.category] ?? "Order supplies",
    examplePrice: `a ${pounds}${(first?.size_label ?? words.service).toLowerCase()}`,
  };
}
