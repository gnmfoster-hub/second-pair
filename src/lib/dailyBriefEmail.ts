/**
 * The morning brief, drawn as a diary rather than written as a letter.
 *
 * Giles, 16 October: "the emails are all just boring text. Can we make them
 * like the theme. So for example the daily brief will look like a diary and
 * have the work for the day."
 *
 * The text version stays exactly as it is and is still sent: half the world
 * reads mail as text, and a missing text part is a spam signal. This is the
 * other half of the same message.
 *
 *
 * Why it is a table of two columns and not something nicer
 * -------------------------------------------------------
 *
 * Email has no flexbox, no grid, no stylesheet worth relying on and no
 * variables. Outlook on Windows renders through Word. So the diary is built
 * the only way a diary can be built here: a presentation table with a narrow
 * time column and a wide content column, and a one pixel left border on the
 * content column.
 *
 * That border is the whole trick. It is the rail down the side of a day in
 * the diary on screen, and it is what makes a list of times read as a day
 * rather than as a list of times.
 *
 *
 * What changed on 21 October, and why
 * -----------------------------------
 *
 * Giles, looking at the version above: "the daily diary needs to look better,
 * more like a diary." He is right, and the reason is worth writing down
 * because it is not a styling problem.
 *
 * A diary is mostly empty. What an owner reads a day for is as much the gaps
 * as the appointments: the two hours between the school run and the sitting
 * is the thing that could be sold, and the old version did not know it
 * existed. It printed every appointment with the same space between them
 * whether they were back to back or four hours apart, so a packed day and an
 * empty one looked identical. That is a list of times wearing a diary's
 * clothes.
 *
 * So the empty time is drawn now: every gap worth filling gets its own quiet
 * row, the rail runs through it, and the head of the day says how much of the
 * day is booked and how much is not. Each entry also carries the colour its
 * card has in the diary on screen, so the email and the app agree about what
 * is client work and what is time off.
 */

import { FONT, FIGURES, escapeHtml } from "./messaging/emailTemplate.ts";
import { formatPence } from "./money.ts";
import { readableNumber } from "./channels/phoneNumbers.ts";
import type { BriefBooking } from "./dailyBrief.ts";
import { categoryFor } from "./calendar.ts";

const INK = "#16150f";
const PAPER = "#fffdf4";
const MUTED = "#6b675c";
const LINE = "#e6e2d8";
const RAIL = "#ded9cc";
const ACCENT = "#1f3be3";
const OWED = "#a8321f";

/**
 * The colour tokens the diary uses, as literals an email can read.
 *
 * Which category is which colour is decided once, in lib/calendar, and this
 * only translates the token it gives back: ten categories collapse onto four
 * colours there, and duplicating that mapping here would be the second copy
 * that goes stale. The values are --cal-client, --cal-work, --cal-note and
 * --cal-off from globals.css, light mode, because an email cannot read a CSS
 * variable and has no idea which theme the reader is in.
 *
 * The first draft did duplicate it, and keyed on "client" and "off" while
 * the database stores "appointment", "personal" and "break". Every entry in
 * the day came out the same blue, including the school run.
 */
const LITERAL: Record<string, string> = {
  "var(--cal-client)": "#1f3be3",
  "var(--cal-work)": "#6b4a9e",
  "var(--cal-note)": "#16697a",
  "var(--cal-off)": "#7b8598",
};

/** A gap shorter than this is turning round between jobs, not free time. */
const WORTH_SAYING_MINUTES = 30;

function at(iso: string, timeZone: string, long = false): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    ...(long
      ? { weekday: "long" as const, day: "numeric" as const, month: "long" as const }
      : { hour: "numeric" as const, minute: "2-digit" as const, hour12: true }),
  })
    .format(new Date(t))
    .replace(/:00(?=\s?[ap]m)/i, "")
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
}

/**
 * A stretch of time, in the words somebody would say it in.
 *
 * "1 hour 45 minutes" rather than "1.75 hours" or "105 minutes", because this
 * is read over a cup of tea and not by an accountant.
 */
function spell(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} minutes`;
  const h = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest ? `${h} ${rest} minutes` : h;
}

/** One appointment, as a row of the day. */
function row(b: BriefBooking, timeZone: string, manyPeople: boolean): string {
  const when = b.all_day
    ? "All day"
    : `${at(b.starts_at, timeZone)}<br><span style="color:${MUTED};font-weight:400">${at(b.ends_at, timeZone)}</span>`;

  const what = escapeHtml(b.title?.trim() || "Booked");
  const hue = LITERAL[categoryFor(b.category).hue] ?? LITERAL["var(--cal-client)"];

  const under: string[] = [];
  if (b.client && b.client !== b.title) under.push(escapeHtml(b.client));
  if (b.phone) {
    /*
     * Tappable, and said the way a person writes it down.
     *
     * Stored as +447780575834, which is correct and is not what anybody
     * reads. The product already has readableNumber for exactly this and
     * the diary uses it; the first draft of this email did not, and printed
     * the stored form at somebody over breakfast.
     */
    const bare = b.phone.replace(/[^\d+]/g, "");
    under.push(
      `<a href="tel:${escapeHtml(bare)}" style="color:${ACCENT};text-decoration:none">${escapeHtml(
        readableNumber(b.phone),
      )}</a>`,
    );
  }
  if (typeof b.price_pence === "number" && b.price_pence > 0) {
    under.push(`<span style="font-family:${FIGURES}">${formatPence(b.price_pence)}</span>`);
  }
  if (manyPeople && b.who) under.push(escapeHtml(b.who));

  const owed =
    (b.deposit_amount_pence ?? 0) > 0 && b.deposit_status !== "paid"
      ? `<div style="margin-top:5px;font-size:12px;color:${OWED}">Deposit of ${formatPence(
          b.deposit_amount_pence as number,
        )} not paid</div>`
      : "";

  const note = b.notes?.trim()
    ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:${INK}">${escapeHtml(
        b.notes.trim(),
      ).replace(/\n/g, "<br>")}</div>`
    : "";

  /*
   * The colour goes on a bar beside the title, not on the rail.
   *
   * The rail has to be one unbroken line down the day or it stops reading as
   * a diary, so it cannot also change colour per entry. A short bar does the
   * job the coloured card edge does on screen, and being a background on a
   * narrow cell it degrades to nothing rather than to a broken box in the
   * clients that strip colour.
   */
  return `<tr>
    <td style="width:76px;padding:13px 14px 13px 0;vertical-align:top;text-align:right;
               font-family:${FIGURES};font-size:13px;font-weight:600;line-height:1.45;color:${INK};
               white-space:nowrap">${when}</td>
    <td style="padding:13px 0 13px 16px;vertical-align:top;border-left:1px solid ${RAIL}">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td width="3" style="width:3px;padding:0;background:${hue};font-size:1px;line-height:1px">&nbsp;</td>
        <td style="padding-left:11px">
          <div style="font-size:15px;font-weight:600;line-height:1.35;color:${INK}">${what}</div>
          ${under.length ? `<div style="margin-top:4px;font-size:13px;line-height:1.5;color:${MUTED}">${under.join(" &middot; ")}</div>` : ""}
          ${owed}
          ${note}
        </td>
      </tr></table>
    </td>
  </tr>`;
}

/** Empty time between two appointments, with the rail running through it. */
function gap(minutes: number): string {
  return `<tr>
    <td style="width:76px;padding:0 14px 0 0"></td>
    <td style="padding:8px 0 8px 16px;border-left:1px solid ${RAIL};
               font-size:12px;line-height:1.4;color:${MUTED};font-family:${FONT}">
      ${escapeHtml(spell(minutes))} free
    </td>
  </tr>`;
}

/**
 * @param bookings everything in the day, in any order
 * @param about the day, whose it is, and what to call them
 */
export function dailyBriefHtml(
  bookings: BriefBooking[],
  about: {
    day: string;
    timeZone: string;
    business: string;
    forWhom?: string | null;
    manyPeople?: boolean;
    /** The way back into the diary itself, where there is one. */
    diaryUrl?: string | null;
  },
): string {
  const { timeZone, business } = about;
  const many = about.manyPeople ?? false;

  const inOrder = [...bookings].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  const allDay = inOrder.filter((b) => b.all_day);
  const timed = inOrder.filter((b) => !b.all_day);

  const day = at(about.day, timeZone, true);

  /* What the day comes to, from the prices actually on it. */
  const priced = timed.filter((b) => typeof b.price_pence === "number" && (b.price_pence ?? 0) > 0);
  const total = priced.reduce((t, b) => t + (b.price_pence ?? 0), 0);

  /*
   * The day drawn out, appointment by appointment, with the empty time in it.
   *
   * The end of the day so far runs forward as the latest end seen, rather
   * than being the end of the one before. Two appointments can overlap, and a
   * day with a double booking in it would otherwise turn a negative gap into
   * an enormous one and announce six hours free in the middle of a full day.
   */
  const pieces: string[] = [];
  let until = 0;
  let freeMinutes = 0;
  let bookedMinutes = 0;

  for (const b of timed) {
    const starts = Date.parse(b.starts_at);
    const ends = Date.parse(b.ends_at);
    if (Number.isFinite(starts) && Number.isFinite(ends) && ends > starts) {
      bookedMinutes += Math.round((ends - starts) / 60_000);
    }
    if (until && Number.isFinite(starts)) {
      const free = Math.round((starts - until) / 60_000);
      if (free >= WORTH_SAYING_MINUTES) {
        pieces.push(gap(free));
        freeMinutes += free;
      }
    }
    pieces.push(row(b, timeZone, many));
    if (Number.isFinite(ends)) until = Math.max(until, ends);
  }

  /*
   * The head of the day: the line somebody reads before deciding whether to
   * read anything else, so it carries the shape of the day and not just a
   * count of the things in it.
   */
  const parts: string[] = [];
  parts.push(
    timed.length
      ? `${timed.length} ${timed.length === 1 ? "appointment" : "appointments"}`
      : "Nothing booked",
  );
  if (timed.length) {
    const first = at(timed[0].starts_at, timeZone);
    const last = at(timed[timed.length - 1].ends_at, timeZone);
    if (first && last) parts.push(`${first} to ${last}`);
    if (bookedMinutes) parts.push(`${spell(bookedMinutes)} booked`);
    if (freeMinutes) parts.push(`${spell(freeMinutes)} free in between`);
  }
  if (priced.length) {
    parts.push(`<span style="font-family:${FIGURES}">${formatPence(total)}</span> booked in`);
  }

  const empty = `<tr><td style="padding:22px 0 8px">
      <div style="font-size:15px;line-height:1.55;color:${MUTED}">
        Nothing in the diary today. If that is wrong, it is worth a look.
      </div>
    </td></tr>`;

  const open = about.diaryUrl
    ? `<tr><td style="padding:22px 28px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="border-radius:10px;background:${ACCENT}">
            <a href="${escapeHtml(about.diaryUrl)}"
               style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:600;
                      color:#ffffff;text-decoration:none;font-family:${FONT}">Open the diary</a>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(day)}</title></head>
<body style="margin:0;padding:0;background:#f2efe6;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2efe6">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;max-width:600px;background:${PAPER};border:1px solid ${LINE};
              border-radius:14px;font-family:${FONT}">

  <tr><td style="padding:26px 28px 0">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};font-family:${FONT}">
      ${escapeHtml(about.forWhom ? `${about.forWhom} at ${business}` : business)}
    </div>
    <div style="margin-top:6px;font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.15;color:${INK};font-family:${FONT}">
      ${escapeHtml(day)}
    </div>
    <div style="margin-top:6px;font-size:13px;line-height:1.5;color:${MUTED};font-family:${FONT}">
      ${parts.join(" &middot; ")}
    </div>
  </td></tr>

  ${
    allDay.length
      ? `<tr><td style="padding:18px 28px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${allDay.map((b) => row(b, timeZone, many)).join("")}
          </table>
        </td></tr>`
      : ""
  }

  <tr><td style="padding:${allDay.length ? "0" : "8px"} 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${pieces.length || allDay.length ? pieces.join("") : empty}
    </table>
  </td></tr>

  ${open}

  <tr><td style="padding:22px 28px 26px">
    <div style="border-top:1px solid ${LINE};padding-top:14px">
      <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};font-family:${FONT}">
        Sent every morning because it is switched on in Settings, Reminders.
        Reply to this email if anything here looks wrong.
      </p>
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
