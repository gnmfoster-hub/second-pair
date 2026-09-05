/**
 * Rows a spreadsheet will open without argument.
 *
 * A business asking for its data back wants a file it can open, not an export
 * format. That means CSV, and CSV is only simple until somebody's name has a
 * comma in it, or their note has a line break, or their phone number starts
 * with a plus and Excel decides it is a formula.
 */

/**
 * One field, escaped.
 *
 * Quoted whenever it contains anything that would otherwise end the field, and
 * doubled quotes inside — the rule everything that reads CSV agrees on.
 */
function field(value: unknown): string {
  if (value == null) return "";

  let text = String(value);

  /*
   * A leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
   *
   * A phone number saved as "+447700900123" is the ordinary case, and it opens
   * as a broken formula rather than a number. Worse, a note somebody typed
   * beginning with = would be executed on open, which is how a contact list
   * becomes an attack on whoever opens it.
   *
   * Prefixed with an apostrophe, which every spreadsheet reads as "this is
   * text" and does not display.
   */
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(headings: string[], rows: unknown[][]): string {
  const lines = [headings.map(field).join(",")];
  for (const row of rows) lines.push(row.map(field).join(","));

  /*
   * Carriage returns and a byte order mark, both for Excel.
   *
   * Without the mark it opens a UTF-8 file as the local codepage, so an
   * accented name arrives as mojibake — which for a client list is somebody's
   * name spelled wrong in the file they were given to keep.
   */
  return "﻿" + lines.join("\r\n") + "\r\n";
}
