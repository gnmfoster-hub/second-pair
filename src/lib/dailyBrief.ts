/**
 * The day, in an email, for somebody who is not going to open the diary.
 *
 * Giles, 15 October: "can we have a daily brief that clients can switch on or
 * off, it will be sent to the primary person, so individual workers if they
 * are set up separate or the owner if not. This will include a run down of
 * the days diary including everything in case they dont log into the diary."
 *
 * The last clause is the whole specification. This is not a summary and not a
 * dashboard: it is the day, written out, for somebody standing by a van at
 * seven in the morning who is not going to log in to anything. So it carries
 * the things you would otherwise have to open an appointment to find, the
 * phone number and the note in particular, and it says the quiet days out
 * loud too, because an empty inbox cannot be told from a broken one.
 *
 * Pure, and takes the day's rows rather than a database, so every shape of
 * day can be tested: the overnight job, the all-day block, the one with no
 * price, the one with nobody's name on it, and the day with nothing in it.
 */

/* With the extension: the tests load this file in node, where an import with
 * no extension does not resolve. */
import { formatPence } from "./money.ts";

export type BriefBooking = {
  starts_at: string;
  ends_at: string;
  all_day: boolean | null;
  title: string | null;
  notes: string | null;
  price_pence: number | null;
  category: string | null;
  /** Whose it is, where the business has more than one person. */
  who: string | null;
  client: string | null;
  phone: string | null;
  /** What is still owed on it, so nobody is asked for money twice. */
  deposit_amount_pence: number | null;
  deposit_status: string | null;
};

export type Brief = { subject: string; text: string };

/** "9am", "9:30am", said the way the reminders say it. */
function clock(iso: string, timeZone: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(t))
    .replace(/:00(?=\s?[ap]m)/i, "")
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
}

/** "Thursday 16 October". */
function longDay(iso: string, timeZone: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(t));
}

/**
 * One appointment, as a line and the lines that hang off it.
 *
 * Indented continuation rather than one long line, because the whole thing is
 * read on a phone and a wrapped line in a plain text email is unreadable.
 */
function lines(b: BriefBooking, timeZone: string, manyPeople: boolean): string[] {
  const when = b.all_day ? "All day" : `${clock(b.starts_at, timeZone)} to ${clock(b.ends_at, timeZone)}`;
  const what = b.title?.trim() || "Booked";
  const head = [when, what, manyPeople && b.who ? `with ${b.who}` : ""].filter(Boolean).join("  ");

  const out = [head];

  const under: string[] = [];
  if (b.client && b.client !== what) under.push(b.client);
  if (b.phone) under.push(b.phone);
  if (typeof b.price_pence === "number" && b.price_pence > 0) under.push(formatPence(b.price_pence));

  /*
   * What is still owed, where a deposit was asked for and has not arrived.
   *
   * This is the one thing in the day somebody can act on before leaving the
   * house, so it is said rather than left to be discovered on arrival.
   */
  if ((b.deposit_amount_pence ?? 0) > 0 && b.deposit_status !== "paid") {
    under.push(`deposit of ${formatPence(b.deposit_amount_pence as number)} not paid`);
  }

  if (under.length) out.push(`    ${under.join("  ")}`);
  if (b.notes?.trim()) out.push(`    ${b.notes.trim().replace(/\s*\n\s*/g, " ")}`);

  return out;
}

/**
 * The whole day for one person, or for the business.
 *
 * @param forWhom the worker this is addressed to, or null for the business
 */
export function dailyBrief(
  bookings: BriefBooking[],
  about: {
    /** Any instant inside the day being described. */
    day: string;
    timeZone: string;
    business: string;
    forWhom?: string | null;
    /** Whether to say whose each one is. A one-chair business should not. */
    manyPeople?: boolean;
  },
): Brief {
  const { timeZone, business } = about;
  const day = longDay(about.day, timeZone);

  const inOrder = [...bookings].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  /* All-day things first: they are the frame the rest of the day sits in. */
  const allDay = inOrder.filter((b) => b.all_day);
  const timed = inOrder.filter((b) => !b.all_day);

  const subject = timed.length
    ? `${day}: ${timed.length} ${timed.length === 1 ? "appointment" : "appointments"}`
    : `${day}: nothing booked`;

  const body: string[] = [];
  body.push(about.forWhom ? `Morning ${about.forWhom}.` : `Good morning.`);
  body.push("");

  if (!timed.length && !allDay.length) {
    /*
     * Said rather than skipped.
     *
     * A brief that only arrives on busy days is one nobody can trust on a
     * quiet one: no email and no appointments look identical to no email and
     * a broken job.
     */
    body.push(`Nothing in the diary for ${day}.`);
  } else {
    for (const b of allDay) body.push(...lines(b, timeZone, about.manyPeople ?? false));
    if (allDay.length && timed.length) body.push("");
    for (const b of timed) {
      body.push(...lines(b, timeZone, about.manyPeople ?? false));
      body.push("");
    }
  }

  /*
   * What the day comes to, where anything in it has a price.
   *
   * Only from the prices actually on the appointments: a total that quietly
   * counted the ones with no price as nothing would be a number that is wrong
   * in a way nobody can see.
   */
  const priced = timed.filter((b) => typeof b.price_pence === "number" && (b.price_pence ?? 0) > 0);
  if (priced.length) {
    const total = priced.reduce((t, b) => t + (b.price_pence ?? 0), 0);
    const all = priced.length === timed.length;
    body.push(
      all
        ? `${formatPence(total)} booked in.`
        : `${formatPence(total)} booked in, across ${priced.length} of the ${timed.length} with a price on them.`,
    );
  }

  body.push("");
  body.push(`${business}. Reply to this email if anything here looks wrong.`);

  return { subject, text: body.join("\n").replace(/\n{3,}/g, "\n\n") };
}
