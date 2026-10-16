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
 */

import { FONT, FIGURES, escapeHtml } from "./messaging/emailTemplate.ts";
import { formatPence } from "./money.ts";
import { readableNumber } from "./channels/phoneNumbers.ts";
import type { BriefBooking } from "./dailyBrief.ts";

const INK = "#16150f";
const PAPER = "#fffdf4";
const MUTED = "#6b675c";
const LINE = "#e6e2d8";
const RAIL = "#ded9cc";
const ACCENT = "#1f3be3";
const OWED = "#a8321f";

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

/** One appointment, as a row of the day. */
function row(b: BriefBooking, timeZone: string, manyPeople: boolean): string {
  const when = b.all_day
    ? "All day"
    : `${at(b.starts_at, timeZone)}<br><span style="color:${MUTED};font-weight:400">${at(b.ends_at, timeZone)}</span>`;

  const what = escapeHtml(b.title?.trim() || "Booked");

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

  return `<tr>
    <td style="width:76px;padding:14px 14px 14px 0;vertical-align:top;text-align:right;
               font-family:${FIGURES};font-size:13px;font-weight:600;line-height:1.45;color:${INK};
               white-space:nowrap">${when}</td>
    <td style="padding:14px 0 14px 16px;vertical-align:top;border-left:1px solid ${RAIL}">
      <div style="font-size:15px;font-weight:600;line-height:1.35;color:${INK}">${what}</div>
      ${under.length ? `<div style="margin-top:4px;font-size:13px;line-height:1.5;color:${MUTED}">${under.join(" &middot; ")}</div>` : ""}
      ${owed}
      ${note}
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

  const count = timed.length
    ? `${timed.length} ${timed.length === 1 ? "appointment" : "appointments"}`
    : "Nothing booked";
  const money = priced.length
    ? ` &middot; <span style="font-family:${FIGURES}">${formatPence(total)}</span> booked in`
    : "";

  const empty = `<tr><td style="padding:22px 0 8px">
      <div style="font-size:15px;line-height:1.55;color:${MUTED}">
        Nothing in the diary today. If that is wrong, it is worth a look.
      </div>
    </td></tr>`;

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
      ${escapeHtml(business)}
    </div>
    <div style="margin-top:6px;font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.15;color:${INK};font-family:${FONT}">
      ${escapeHtml(day)}
    </div>
    <div style="margin-top:6px;font-size:13px;color:${MUTED};font-family:${FONT}">
      ${count}${money}
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
      ${timed.length || allDay.length ? timed.map((b) => row(b, timeZone, many)).join("") : empty}
    </table>
  </td></tr>

  <tr><td style="padding:22px 28px 26px">
    <div style="border-top:1px solid ${LINE};padding-top:14px">
      <p style="margin:0;font-size:11px;line-height:1.5;color:${MUTED};font-family:${FONT}">
        ${about.forWhom ? `${escapeHtml(about.forWhom)}&rsquo;s day at ` : ""}${escapeHtml(business)}.
        Sent every morning because it is switched on in Settings, Reminders.
        Reply to this email if anything here looks wrong.
      </p>
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
