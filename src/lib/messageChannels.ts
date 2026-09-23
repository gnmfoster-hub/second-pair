/**
 * Which channels one message goes out on.
 *
 * Giles asked for email first with text as the fallback, both where we have
 * the details, and the option to turn either off — and, in the same breath,
 * that text reminders must not quietly stop, because customers expect them.
 *
 * Both of those are true, which is why this is a business's choice rather than
 * a rule. A text is what people expect and costs money every time; an email
 * costs nothing and carries the whole message, a link and a layout.
 *
 * Pure, and separate from routesFor, which answers a different question: what
 * is technically open. This answers what the business wants used out of what
 * is open, which is the part with an opinion in it.
 */

export type Preference =
  | "as_they_came"
  | "both"
  | "email_first"
  | "email_only"
  | "sms_only";

/** Only the parts of a route this needs. See messaging/reach. */
export type Route = {
  channel: string;
  to: string;
  open?: boolean;
  lastInboundAt?: string | null;
};

export const DEFAULT_PREFERENCE: Preference = "as_they_came";

/** Absent or unrecognised reads as today's behaviour, never as something new. */
export function preferenceOf(value: unknown): Preference {
  return value === "both" ||
    value === "email_first" ||
    value === "email_only" ||
    value === "sms_only"
    ? value
    : DEFAULT_PREFERENCE;
}

/**
 * The channels to actually send this message on, in order.
 *
 * `routes` is what routesFor produced — already ordered with open ones first,
 * already filtered to what the business has connected.
 *
 * Returns more than one only for "both", and only where both are genuinely
 * available: a preference cannot conjure an address nobody gave us.
 */
export function chooseRoutes(
  preference: Preference,
  routes: Route[],
  /**
   * Whether a text may be sent at all right now.
   *
   * False when the month's ceiling has been reached. Email still goes — the
   * point of a ceiling is to stop the spend, not to stop the message.
   */
  textsAllowed = true,
): Route[] {
  const open = routes.filter((r) => r.open !== false);
  const email = open.find((r) => r.channel === "email") ?? null;
  const sms = textsAllowed ? (open.find((r) => r.channel === "sms") ?? null) : null;

  switch (preference) {
    case "email_only":
      return email ? [email] : [];

    case "sms_only":
      return sms ? [sms] : [];

    case "email_first":
      /* Text only where there is no address to email. */
      return email ? [email] : sms ? [sms] : [];

    case "both": {
      const both = [email, sms].filter((r): r is Route => r !== null);
      /*
       * Where we hold neither, fall back to whatever else is open — a
       * WhatsApp thread, the website. "Both" is a statement about email and
       * text, not an instruction to say nothing when there is neither.
       */
      return both.length ? both : open.slice(0, 1);
    }

    case "as_they_came":
    default:
      /*
       * What has always happened: the first open route, which routesFor has
       * already ordered by the channel they arrived on. Unchanged on purpose,
       * so running the migration alters nothing until a business chooses.
       */
      return open.slice(0, 1);
  }
}

/**
 * Whether another text may go out this month.
 *
 * A ceiling rather than a billing allowance: past it we stop, so a loop, an
 * import or an unusually busy fortnight cannot run up a bill nobody agreed to.
 * Null means no ceiling, which is every business until somebody sets one.
 */
export function textsAllowed(sentThisMonth: number, cap: number | null | undefined): boolean {
  if (cap === null || cap === undefined) return true;
  return sentThisMonth < cap;
}
