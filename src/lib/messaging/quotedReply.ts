/**
 * Telling what somebody just wrote from what their mail client quoted back.
 *
 * An email in the inbox read like this:
 *
 *   May I send an Proposal and Pricing?
 *
 *   thanks,
 *
 *   ________________________________
 *   From: Ayera Khan
 *   Sent: Thursday, September 17, 2026 12:55 PM
 *   Subject: Re: Yes
 *
 *   Hi, I was going through your website...
 *
 * Giles said it looked like code, which is exactly right: a rule of thirty
 * underscores and a block of headers is machinery, and every mail client ever
 * written folds it away behind one line. We were printing it whole, so a
 * two-sentence email filled the screen with its own history and the part
 * somebody actually needed to read was the first three lines of it.
 *
 * Only ever a display decision. The whole message stays exactly as it arrived
 * in the database, because it is the record of what was sent, and because a
 * trimmer that guesses wrong must never be able to lose anybody's words.
 */

/**
 * The line that starts the history, in the several ways clients write it.
 *
 * Ordered by how sure each one is. An underscore rule is unambiguous. "On …
 * wrote:" is nearly so. A bare From: line only counts when Sent: or Date:
 * follows it, because "From: the kitchen" is a sentence somebody might write.
 */
const MARKERS: { pattern: RegExp; sure: boolean }[] = [
  // Outlook's rule, and the one that prompted this.
  { pattern: /^\s*_{5,}\s*$/, sure: true },
  { pattern: /^\s*-{2,}\s*original message\s*-{2,}\s*$/i, sure: true },
  { pattern: /^\s*-{2,}\s*forwarded message\s*-{2,}\s*$/i, sure: true },
  // Gmail and Apple Mail, with the date wrapped or not.
  { pattern: /^\s*On .{0,120}\bwrote:\s*$/i, sure: true },
  { pattern: /^\s*On .{0,200},\s*$/i, sure: false },
  // Outlook without the rule above it.
  { pattern: /^\s*From:\s*\S/i, sure: false },
];

/** A header line of the block Outlook writes under From:. */
const HEADER = /^\s*(?:from|sent|to|cc|subject|date|reply-to)\s*:/i;

export type Split = {
  /** What this person wrote this time. */
  said: string;
  /** Their client's copy of what came before, or empty. */
  quoted: string;
};

export function splitQuoted(body: string): Split {
  const lines = (body ?? "").split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { pattern, sure } of MARKERS) {
      if (!pattern.test(line)) continue;

      /*
       * An unsure marker has to be corroborated by the lines under it.
       *
       * "From:" on its own is a word somebody might start a sentence with.
       * "From:" followed by "Sent:" or "Subject:" within the next few lines is
       * a mail client's header block and nothing else.
       */
      if (!sure) {
        const following = lines.slice(i + 1, i + 5);
        if (!following.some((l) => HEADER.test(l))) continue;
      }

      const said = lines.slice(0, i).join("\n").trimEnd();
      const quoted = lines.slice(i).join("\n").trim();

      /*
       * Never leave somebody with nothing.
       *
       * A forward with no covering note is all history and no message, and
       * hiding the lot would show an empty bubble. Better to print it whole
       * than to print nothing at all.
       */
      if (!said.trim()) return { said: body.trim(), quoted: "" };

      return { said, quoted };
    }
  }

  return { said: (body ?? "").trim(), quoted: "" };
}
