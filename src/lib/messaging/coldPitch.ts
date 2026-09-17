/**
 * Whether an email is somebody selling to the business rather than a customer.
 *
 * Living Canvas received seven in one day and the assistant answered every one
 * in the studio's name: "If I bring 30–45 orders to Livingcanvastattoo in
 * September, can we explore a collaboration?", "just wanted to check if I've
 * reached the owner of the store?", "Hey 👋" with no subject. None had a
 * machine header or an unsubscribe link, which is all the older rules looked
 * for, because these are typed — or made to look typed — by a person working
 * down a list of shops.
 *
 * They are easy to tell apart once you look at what they share, and no single
 * sign is trusted on its own: a customer can say "collaborate", or email from a
 * Gmail address with numbers in it. Each sign carries a weight and it takes two
 * points to call it a pitch. The strongest signs are worth two by themselves,
 * because no customer writes them:
 *
 *  - The business's name squashed into one word — "Livingcanvastattoo" — which
 *    is what a scraper makes from a web address. People write "Living Canvas".
 *  - Promises in numbers: "10–20 sales per week", "150-300 orders monthly",
 *    "a 3% commission".
 *
 * Pure and alone in its file, so the real examples can be tested word for word.
 */

export type Pitch = { pitch: boolean; score: number; signs: string[] };

const FREEMAIL = /@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|proton(mail)?|aol|gmx|yandex|mail)\./i;

// What a marketer names their throwaway inbox after.
/*
 * Words a seller's throwaway address is made of — matched as parts of the
 * address, not anywhere inside it.
 *
 * As a bare search, "brand" matched brandon@ and "dev" matched devon@, so a
 * real customer forwarding something ("Fwd:", no thread headers) from their
 * own Gmail scored as a pitch and was ignored outright. Short words now have
 * to be a whole part of the address (seo.growth, digital-dev22); longer ones
 * may start or end a part (salesforce, growthexpert).
 */
const SELLER_SHORT = new Set(["seo", "dev", "ecom", "store", "brand", "promo", "lead", "leads", "sales"]);
const SELLER_LONG = [
  "agency", "expert", "digital", "marketing", "growth", "shopify", "consult",
  "traffic", "webdesign", "support", "suport", "solution", "solutions",
];

function sellerName(local: string): boolean {
  const parts = local.toLowerCase().split(/[._\-+\d]+/).filter(Boolean);
  return parts.some(
    (part) =>
      SELLER_SHORT.has(part) ||
      SELLER_LONG.some((word) => part === word || part.startsWith(word) || part.endsWith(word)),
  );
}

/*
 * A number of orders, however it is written.
 *
 * The range form was all this looked for, so "200+ orders in 24–48 hours"
 * scored nothing at all and the assistant answered it in the studio's name.
 * A bare figure in front of orders or sales is the same promise and is just as
 * safe to match: a customer of a tattoo studio does not mention two hundred
 * orders under any circumstances.
 */
const NUMBERED_PROMISE =
  /\b\d{1,4}\s*(?:[–—-]|to)\s*\d{1,4}\s*(?:\+\s*)?(?:new\s+)?(?:orders|sales|customers|clients|leads|bookings|commandes|ventes)\b|\b\d{2,4}\s*\+?\s*(?:new\s+)?(?:orders|sales|leads)\b/i;
const RATE_PROMISE =
  /\b(?:orders|sales|leads|commandes|ventes)\s+(?:per|a|each|every|par)\s+(?:day|week|month|jour|semaine|mois)\b|\b(?:orders|sales)\s+(?:daily|weekly|monthly)\b/i;
// "3%" and "3 percent" are the same offer. Only the first was being read.
const PERCENT_COMMISSION =
  /\b\d{1,2}\s*(?:%|per\s?cent(?:age)?)\s*(?:commission|of (?:the )?(?:sales|revenue|profit))\b/i;

const PITCH_PHRASES: { pattern: RegExp; sign: string }[] = [
  /*
   * Asking for the owner, in any of the ways they write it.
   *
   * Every version of this has needed widening once. It began as "owner of
   * the store", then "the store owner", then "am I speaking with the
   * owner" — and the next one through the door was four words with none of
   * those in it: "Is the owner here?" followed by the web address. Nobody
   * writing to a tattooist about a tattoo asks for the owner; they ask
   * about the tattoo.
   */
  {
    pattern:
      /\bowner of (?:the|this|your) (?:store|shop|business|brand)\b|\b(?:the|this|your) (?:store|shop|business|brand) owner\b|\b(?:speaking|talking|chatting) (?:with|to) (?:the|your) (?:owner|manager|boss|person in charge)\b|\b(?:is|are)\s+(?:the|there)\s+(?:a\s+|an\s+)?(?:owner|manager|boss)\b|\bare\s+you\s+the\s+(?:owner|manager|boss)\b|\b(?:owner|manager|boss)\s+(?:here|there|around|available|in)\b|\b(?:can|may|could)\s+i\s+(?:speak|talk|chat)\s+(?:to|with)\s+(?:the\s+)?(?:owner|manager|boss)\b|\bwho(?:'s|\u2019s| is)\s+(?:the\s+)?(?:owner|manager)\b/i,
    sign: "asks whether it has reached the owner",
  },
  /*
   * "This store" — the word an e-commerce list buys by, and one nobody uses to
   * a tattooist, a cleaner or an electrician about their own business.
   */
  { pattern: /\b(?:regarding|about|concerning|re)\s+(?:this|your|the)\s+(?:store|shop|website|site|brand)\b|\bnew visitor\b/i, sign: "writes to the business as an online store" },
  { pattern: /\b(?:e-?com(?:merce)?|shopify|dropshipping|seo services?|lead generation|marketing agency)\b/i, sign: "sells online marketing" },
  { pattern: /\b(?:boost|increase|grow|skyrocket|double)\s+(?:your\s+)?(?:sales|orders|revenue|traffic|conversions)\b/i, sign: "promises more sales" },
  { pattern: /\b(?:may|can|shall) i send (?:you )?(?:a |the |our )?(?:quote|price|proposal|pricing)\b|\bsend you (?:a |the |our )?(?:quote|proposal|price list)\b/i, sign: "offers to send the business a quote" },
  { pattern: /\b(?:seo|website|site) (?:audit|errors?|issues|report)\b|\baudit errors?\b|\berrors? on your (?:web)?site\b|\brank(?:ing)? (?:on|higher on) google\b/i, sign: "reports problems with the website" },
  // Including "kindly share your WhatsApp", which is how the last one asked.
  { pattern: /\bbest\s+whats\s?app\b|\bwhats\s?app\s+(?:number\s+)?to\s+(?:connect|reach|chat)\b|\b(?:share|send|drop|give)\s+(?:me\s+)?(?:your\s+|the\s+)?whats\s?app\b/i, sign: "asks to move to WhatsApp" },
  { pattern: /\b(?:store|shop)\s+(?:stands out|has (?:great|huge|real) potential)|\bproducts? potential\b/i, sign: "flatters the store" },
  { pattern: /\bcollaborat\w*\b[^.?!]{0,80}\b(?:orders|sales|store|brand|promot\w*|marketing)\b|\b(?:orders|sales|store|brand|promot\w*|marketing)\b[^.?!]{0,80}\bcollaborat\w*/i, sign: "offers a sales collaboration" },
];

const GREETING_ONLY = /^\s*(?:hi|hey|hello|hiya|good (?:morning|afternoon|day)|bonjour|hola)[\s!.,]*(?:there)?[\s!.,]*[\p{Extended_Pictographic}‍️\s]*$/iu;

/**
 * The subject, with the ways a mail system writes "there wasn't one".
 *
 * "(no subject)" arrived as the literal subject of a one-word pitch, so the
 * rule about a greeting with no subject never fired on the one email it was
 * written for.
 */
function subjectOf(raw: string | null | undefined): string {
  const subject = (raw ?? "").trim();
  return /^\(?\s*(?:no|without)\s+subject\s*\)?$/i.test(subject) ? "" : subject;
}

function squashed(name: string): string | null {
  const words = name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  // A one-word name cannot be squashed, and matching it would hit every mention.
  if (words.length < 2) return null;
  return words.join("");
}

export function coldPitch(
  email: { from?: string | null; subject?: string | null; body?: string | null; headers?: Record<string, string> | null },
  business: {
    name?: string | null;
    /**
     * The business's own domains — their website, which is their email's
     * domain in nearly every case.
     *
     * A list is bought as web addresses, so the opening line quotes one back:
     * "Is anyone available to chat with regarding this store,
     * livingcanvastattoo.ink". A customer has no reason to write the address
     * of the website they are already looking at, and never does.
     */
    sites?: string[];
  } = {},
): Pitch {
  const subject = subjectOf(email.subject);
  const body = (email.body ?? "").trim();
  const text = `${subject}\n${body}`;
  const from = (email.from ?? "").toLowerCase();
  const address = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
  const headers = Object.fromEntries(
    Object.entries(email.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  const signs: string[] = [];
  let score = 0;
  const add = (points: number, sign: string) => {
    score += points;
    signs.push(sign);
  };

  // The name as a scraper writes it — but not a handle or a web address.
  const squash = squashed(business.name ?? "");
  if (squash) {
    const asWord = new RegExp(`(^|[^@./\\w])${squash}(?![\\w.]*\\.(?:com|co|ink|uk|net|org|io|shop|store))`, "i");
    if (asWord.test(text)) add(2, "writes the business name as one word, like a scraper");
  }

  /*
   * The business's own web address, written out at them.
   *
   * Not as part of an email address — somebody writing "I sent this to
   * info@livingcanvastattoo.ink last week" is a customer chasing a reply, and
   * that is the one shape of message this must never touch.
   */
  for (const site of business.sites ?? []) {
    const domain = (site ?? "").trim().toLowerCase().replace(/^www\./, "");
    if (!domain.includes(".")) continue;
    const written = new RegExp(`(^|[^@\\w.])(?:www\\.)?${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (written.test(text)) {
      /*
       * One point, not two. A customer does write it occasionally — "I found
       * you on livingcanvastattoo.ink and wanted to check before I book" — and
       * that sentence must survive on its own. Every pitch that quotes the
       * address has something else wrong with it as well.
       */
      add(1, "quotes the business's own web address, which is how a list is bought");
      break;
    }
  }

  if (NUMBERED_PROMISE.test(text) || RATE_PROMISE.test(text)) add(2, "promises orders or sales in numbers");
  if (PERCENT_COMMISSION.test(text)) add(2, "asks for a percentage commission");

  for (const { pattern, sign } of PITCH_PHRASES) {
    if (pattern.test(text)) add(1, sign);
  }

  // A reply to a conversation that never happened.
  if (/^(?:re|fw|fwd)\s*:/i.test(subject) && !headers["in-reply-to"] && !headers["references"]) {
    add(1, "says Re: to a message nobody sent");
  }

  /*
   * A domain made of the same words as the throwaway inboxes.
   *
   * vantagecoreagency.com wrote to Living Canvas and nothing looked at the
   * domain at all — only the part in front of the @, and only on free mail. An
   * agency writing from its own agency-shaped domain is the commonest pitch
   * there is, and a real business's domain is its own name.
   */
  const senderDomain = address.split("@")[1] ?? "";
  if (senderDomain && !FREEMAIL.test(address) && sellerName(senderDomain.split(".")[0] ?? "")) {
    add(1, "written from a marketing agency's own domain");
  }

  if (FREEMAIL.test(address)) {
    const local = address.split("@")[0] ?? "";
    // Trailing digits, but not a birth year — half of real Gmail addresses end in one.
    const digits = /(\d{3,})$/.exec(local)?.[1] ?? "";
    const aYear = /^(19|20)\d{2}$/.test(digits);
    if (sellerName(local) || (digits && !aYear)) add(1, "a throwaway seller's address");
  }

  if (!subject && GREETING_ONLY.test(body)) add(1, "a greeting with nothing in it and no subject");

  return { pitch: score >= 2, score, signs };
}
