/**
 * The Monday report, drawn.
 *
 * Giles, 16 October: "the emails are all just boring text. Can we make them
 * like the theme." This is the last of the big ones and the one he named: the
 * report is the single email a business owner reads every week, it is the only
 * regular proof that any of this is working, and it went out as nine bullet
 * points of plain text with a bare URL at the bottom.
 *
 * The text half is unchanged and still sent. This is the other half.
 *
 *
 * What it is shaped like, and why
 * -------------------------------
 *
 * Three figures at the top, big: enquiries, booked, taken. They are the three
 * an owner wants before the kettle has boiled, and a tile is the only way to
 * say "this is the number" in a medium with no headings worth relying on.
 *
 * Then two tables of label against figure, which is the money layout the
 * receipt got in October: the label on the left with room to breathe, the
 * figure right-aligned in tabular digits so a column of them can be read down
 * and added up. Money first because it is what the week comes to, then the
 * week's own count of who came and who did not.
 *
 * Then the two lists that are instructions rather than facts: who has not been
 * back and is overdue by their own rhythm, and how many hours are free in the
 * week ahead. Those are the parts somebody can act on a Monday, so they sit
 * closest to the button.
 *
 * Everything here is the same constraint as every other email in this product:
 * presentation tables, inline styles, literal colours, 600px, no stylesheet
 * and no web font. See messaging/emailTemplate for the long version of why.
 */

import { FONT, FIGURES, escapeHtml } from "./messaging/emailTemplate.ts";

const INK = "#16150f";
const PAPER = "#fffdf4";
const MUTED = "#6b675c";
const LINE = "#e6e2d8";
const WELL = "#f6f3e8";
const ACCENT = "#1f3be3";
const OWED = "#a8321f";

/** One line of a two-column table: what it is, and the figure for it. */
export type Figure = {
  label: string;
  value: string;
  /** Said under the label, where a figure needs a sentence to mean anything. */
  note?: string | null;
  /** Red, for money that has not arrived and work that did not happen. */
  bad?: boolean;
};

export type ReportLetter = {
  business: string;
  /** "Last week", "This month" — whatever the range was asked for as. */
  title: string;
  /** The dates it covers, in words. */
  period: string;
  /** The three at the top: the figure, then what it is. */
  tiles: { value: string; label: string }[];
  money: Figure[];
  week: Figure[];
  /** The prose from reportShape: where the work was, whether it ran to time. */
  notes: string[];
  lapsed: { name: string; detail: string }[];
  /** The hours free in the week ahead, already worded, or nothing. */
  ahead: string | null;
  reportUrl: string;
};

/** A table of labels against right-aligned figures. Empty gives nothing back. */
function table(title: string, rows: Figure[]): string {
  if (!rows.length) return "";
  return `<tr><td style="padding:22px 28px 0">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};font-family:${FONT}">
      ${escapeHtml(title)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px">
      ${rows
        .map(
          (r, i) => `<tr>
            <td style="padding:11px 12px 11px 0;vertical-align:top;font-size:14px;line-height:1.4;
                       color:${INK};font-family:${FONT}${i ? `;border-top:1px solid ${LINE}` : ""}">
              ${escapeHtml(r.label)}
              ${
                r.note
                  ? `<div style="margin-top:3px;font-size:12px;line-height:1.45;color:${MUTED}">${escapeHtml(
                      r.note,
                    )}</div>`
                  : ""
              }
            </td>
            <td style="padding:11px 0;vertical-align:top;text-align:right;white-space:nowrap;
                       font-family:${FIGURES};font-size:15px;font-weight:600;
                       color:${r.bad ? OWED : INK}${i ? `;border-top:1px solid ${LINE}` : ""}">
              ${escapeHtml(r.value)}
            </td>
          </tr>`,
        )
        .join("")}
    </table>
  </td></tr>`;
}

export function reportLetterHtml(letter: ReportLetter): string {
  const business = escapeHtml(letter.business);

  /*
   * The three figures, as cells of one table rather than as three boxes.
   *
   * A table row is the only thing that reliably puts three things beside each
   * other in Outlook, and the widths are percentages so they stay beside each
   * other on a phone rather than stacking into a column of lonely numbers.
   */
  const tiles = letter.tiles.length
    ? `<tr><td style="padding:20px 28px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${WELL};border:1px solid ${LINE};border-radius:12px">
          <tr>
            ${letter.tiles
              .map(
                (t, i) => `<td width="33%" style="padding:16px 10px;text-align:center;vertical-align:top${
                  i ? `;border-left:1px solid ${LINE}` : ""
                }">
                  <div style="font-family:${FIGURES};font-size:24px;font-weight:700;line-height:1.1;color:${INK}">
                    ${escapeHtml(t.value)}
                  </div>
                  <div style="margin-top:5px;font-size:12px;line-height:1.3;color:${MUTED};font-family:${FONT}">
                    ${escapeHtml(t.label)}
                  </div>
                </td>`,
              )
              .join("")}
          </tr>
        </table>
      </td></tr>`
    : "";

  const notes = letter.notes.length
    ? `<tr><td style="padding:20px 28px 0">
        ${letter.notes
          .map(
            (n) =>
              `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${INK};font-family:${FONT}">${escapeHtml(
                n,
              )}</p>`,
          )
          .join("")}
      </td></tr>`
    : "";

  /*
   * The list that is really a job.
   *
   * Named people, overdue by their own usual rhythm, which is the one part of
   * the report worth a Monday morning rather than a glance.
   */
  const lapsed = letter.lapsed.length
    ? `<tr><td style="padding:22px 28px 0">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};font-family:${FONT}">
          Worth a message
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px">
          ${letter.lapsed
            .map(
              (p, i) => `<tr><td style="padding:10px 0;font-family:${FONT}${
                i ? `;border-top:1px solid ${LINE}` : ""
              }">
                <div style="font-size:14px;font-weight:600;color:${INK}">${escapeHtml(p.name)}</div>
                <div style="margin-top:2px;font-size:12px;line-height:1.45;color:${MUTED}">${escapeHtml(
                  p.detail,
                )}</div>
              </td></tr>`,
            )
            .join("")}
        </table>
      </td></tr>`
    : "";

  const ahead = letter.ahead
    ? `<tr><td style="padding:20px 28px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${WELL};border:1px solid ${LINE};border-radius:10px">
          <tr><td style="padding:13px 16px;font-size:14px;line-height:1.5;color:${INK};font-family:${FONT}">
            ${escapeHtml(letter.ahead)}
          </td></tr></table>
      </td></tr>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(letter.title)}, ${business}</title></head>
<body style="margin:0;padding:0;background:#f2efe6;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2efe6">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;max-width:600px;background:${PAPER};border:1px solid ${LINE};
              border-radius:14px;font-family:${FONT}">

  <tr><td style="padding:26px 28px 0">
    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};font-family:${FONT}">
      ${business}
    </div>
    <div style="margin-top:6px;font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.15;color:${INK};font-family:${FONT}">
      ${escapeHtml(letter.title)}
    </div>
    <div style="margin-top:6px;font-size:13px;color:${MUTED};font-family:${FONT}">
      ${escapeHtml(letter.period)}
    </div>
  </td></tr>

  ${tiles}

  ${table("The money", letter.money)}

  ${table("The week", letter.week)}

  ${notes}

  ${lapsed}

  ${ahead}

  <tr><td style="padding:24px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="border-radius:10px;background:${ACCENT}">
        <a href="${escapeHtml(letter.reportUrl)}"
           style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;
                  color:#ffffff;text-decoration:none;font-family:${FONT}">Open the full report</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 28px 26px">
    <div style="border-top:1px solid ${LINE};padding-top:14px">
      <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};font-family:${FONT}">
        Sent every Monday because it is switched on in Settings, Reminders.
        Reply to this email if a figure here looks wrong.
      </p>
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
