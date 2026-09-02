import { createClient } from "./supabase/server";

/**
 * Who is allowed to run the whole platform, as opposed to one business.
 *
 * Held in an environment variable rather than the database, deliberately. Every
 * other permission in this product is a row somebody could in principle write —
 * a bug in a policy, a mistaken insert, an injection — and the blast radius of
 * getting this one wrong is every business at once. A variable only Vercel can
 * change is a smaller target than a table, and it cannot be escalated into.
 *
 * Unset means nobody. A missing variable must never mean "allow", which is the
 * way this class of check usually fails.
 */
function admins(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Is the person making this request an administrator of Second Pair itself?
 *
 * Reads the session on the server every time. Nothing about this is ever taken
 * from the browser, a header, or a query string.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const allowed = admins();
  if (allowed.length === 0) return false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email = user?.email?.trim().toLowerCase();
    return Boolean(email && allowed.includes(email));
  } catch {
    // A broken session is not an administrator.
    return false;
  }
}

/**
 * What the suite is allowed to know about a business.
 *
 * There is deliberately no conversation text, no customer name, no phone
 * number and no photograph anywhere in this file, and no function here can
 * reach one. That is not squeamishness — the privacy notice tells every
 * customer that no other business on Second Pair can see their conversation,
 * and an administration screen that could read them would make that sentence
 * false for everybody at once.
 *
 * Counts are enough to support somebody and to bill them. If a business needs
 * help with a specific conversation they can say what it says.
 */
export type BusinessSummary = {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  createdAt: string;
  owners: { email: string | null; userId: string }[];
  /** For support: is it actually set up, or did they stop halfway? */
  people: number;
  services: number;
  hasHours: boolean;
  /** For billing and for knowing whether it is being used at all. */
  conversations: number;
  bookings: number;
  lastActivityAt: string | null;

  /*
   * The commercial record. This is the part that is genuinely Second Pair's
   * business rather than a look into somebody else's.
   */
  plan: string | null;
  planPence: number;
  seatLimit: number | null;
  status: "trial" | "active" | "overdue" | "paused" | "closed";
  billingStartedOn: string | null;
  note: string | null;
  /** What they are authorised to use. Everything here is chargeable but "web". */
  channels: string[];

  /*
   * How to reach the person who runs it. An email address is not how you ring
   * somebody whose diary has stopped working on a Saturday morning.
   */
  ownerName: string | null;
  ownerPhone: string | null;
  trialEndsOn: string | null;
  /** Days since anybody messaged them. Null when nobody ever has. */
  quietDays: number | null;

  /*
   * The settings a support call is usually about. Configuration, not anybody's
   * personal data — see the note on fixSettings for where the line is.
   */
  settings: {
    timezone: string;
    tone: string | null;
    depositMode: string;
    answeringMode: string;
    hours: { day: number; open: string; close: string; closed: boolean }[];
  };
};

/**
 * How the platform itself is doing.
 *
 * These are the numbers somebody selling this needs, and none of them require
 * reading a conversation: how many businesses, how much work the assistant has
 * actually won for them, how much of it happened outside opening hours, and
 * what it cost to run. "It has booked £14,000 of work for eleven businesses,
 * a third of it while they were shut" is the sentence that sells this, and it
 * has to be true.
 */
export type PlatformKpis = {
  businesses: number;
  live: number;
  unfinished: number;
  /** Monthly recurring revenue, in pence. */
  mrr: number;
  paying: number;
  enquiries: number;
  booked: number;
  /** What the assistant booked, in pence, at the quoted value. */
  wonPence: number;
  outOfHours: number;
  /** What the model cost to run, in pence. */
  costPence: number;
  seatsUsed: number;
  seatsSold: number;
};
