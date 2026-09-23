/**
 * What a customer's email actually looks like.
 *
 * Everything we send has been plain text. That is not a disaster — plain text
 * arrives, threads properly and never renders wrong — but beside the
 * confirmation a salon gets from Fresha it reads as a system notice rather
 * than as a message from a business somebody chose.
 *
 * One function, used by the sender and by the preview on the settings screen.
 * That is the whole point of it being here: ReminderEditor already says a
 * preview that renders a template its own way is a preview that can be wrong,
 * and an email preview drawn from a second copy of this markup would be wrong
 * the first time either changed.
 *
 * Decisions, and the reasons, because most of them are constraints rather than
 * taste:
 *
 * Tables and inline styles. Email clients are not browsers — Outlook renders
 * with Word, Gmail strips <style> blocks, and flexbox is unreliable in both.
 * This looks like 2005 HTML because that is what still arrives intact in 2026.
 *
 * The business is the brand. Their name is the heading, their picture if they
 * have one, and Second Pair once at the bottom in small grey type. A customer
 * has a relationship with them, not with us.
 *
 * No images that matter. Most clients block them by default, so the picture is
 * decoration and never carries information — everything that must be read is
 * text. The one image has an empty alt so a blocked one leaves no broken icon
 * and no stray word.
 *
 * Every colour is a literal. A customer's email client has no idea what our
 * CSS variables are, and a theme-aware email is a contradiction.
 */

export type EmailParts = {
  /** The business, which is the sender as far as the reader is concerned. */
  business: string;
  /** What the message actually says. Already rendered; this only wraps it. */
  body: string;
  /** An absolute URL for the picture of the business, if they have one. */
  photoUrl?: string | null;
  /** The one thing to do, if there is one. */
  action?: { label: string; url: string } | null;
  /** Their cancellation policy, in their own words. */
  policy?: string | null;
};

/* Ink and paper from the brand, as literals: an email cannot read a variable. */
const INK = "#16150f";
const PAPER = "#fffdf4";
const MUTED = "#6b675c";
const LINE = "#e6e2d8";
const ACCENT = "#1f3be3";

/** Escapes the five characters that would otherwise close a tag or an entity. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Line breaks the customer typed, kept, without letting any markup through. */
function paragraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK}">` +
        block.replace(/\n/g, "<br>") +
        `</p>`,
    )
    .join("");
}

/**
 * The same message as plain text, for the half of the world that reads it that
 * way — and for spam filters, which treat a missing text part as a signal.
 */
export function emailText(parts: EmailParts): string {
  const lines = [parts.body.trim()];
  if (parts.action) lines.push("", `${parts.action.label}: ${parts.action.url}`);
  if (parts.policy?.trim()) lines.push("", "If you need to cancel", parts.policy.trim());
  lines.push("", `Sent by ${parts.business}, who use Second Pair to answer and keep the diary.`);
  return lines.join("\n");
}

export function buildEmail(parts: EmailParts): string {
  const business = escapeHtml(parts.business);

  const picture = parts.photoUrl
    ? `<img src="${escapeHtml(parts.photoUrl)}" width="56" height="56" alt="" ` +
      `style="display:block;border-radius:10px;border:1px solid ${LINE};object-fit:cover">`
    : "";

  const action = parts.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px">
         <tr><td style="border-radius:10px;background:${ACCENT}">
           <a href="${escapeHtml(parts.action.url)}"
              style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;
                     color:#ffffff;text-decoration:none">${escapeHtml(parts.action.label)}</a>
         </td></tr>
       </table>`
    : "";

  const policy = parts.policy?.trim()
    ? `<tr><td style="padding:18px 28px 0;border-top:1px solid ${LINE}">
         <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${INK}">If you need to cancel</p>
         <p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED};white-space:pre-line">${escapeHtml(
           parts.policy.trim(),
         )}</p>
       </td></tr>`
    : "";

  /*
   * 600px is the width every email client has agreed on for twenty years, and
   * the only one that reliably does not scroll sideways on a phone.
   */
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${business}</title></head>
<body style="margin:0;padding:0;background:#f2efe6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2efe6">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;max-width:600px;background:${PAPER};border:1px solid ${LINE};border-radius:14px">

  <tr><td style="padding:24px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      ${picture ? `<td style="padding-right:12px">${picture}</td>` : ""}
      <td style="vertical-align:middle">
        <div style="font-size:17px;font-weight:600;color:${INK}">${business}</div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:20px 28px 0">${paragraphs(parts.body)}</td></tr>

  ${action ? `<tr><td style="padding:0 28px">${action}</td></tr>` : ""}

  ${policy}

  <tr><td style="padding:20px 28px 24px">
    <p style="margin:0;font-size:11px;line-height:1.5;color:${MUTED}">
      Sent by ${business}, who use Second Pair to answer and keep the diary.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
