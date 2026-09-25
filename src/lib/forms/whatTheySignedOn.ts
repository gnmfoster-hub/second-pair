/**
 * What somebody signed a form on, in words a person would use.
 *
 * `client_forms.signer_agent` has held the browser's user-agent string since
 * forms were built and nothing has ever read it — found by the audit of
 * columns the product stores and never looks at.
 *
 * It is worth reading because of what a signed consent form is *for*. Nobody
 * opens one to admire it. They open it when there is a disagreement: the
 * customer says they never agreed to the patch test being skipped, or a claim
 * is being made months later. What answers that is the record around the
 * signature — when, from where, and on what.
 *
 * The IP address is already on the page. The device was not, and it is the
 * more human half of the pair: "signed on an iPhone" is something a business
 * owner can hold against their own memory of the appointment, where an IP
 * address is four numbers they can do nothing with.
 *
 * Deliberately coarse. This says phone, tablet or computer and roughly which
 * family, and it stops there. Parsing a user-agent finely is a losing game —
 * every browser lies about being every other browser, and a record that says
 * "Chrome 118.0.5993.88" is precision nobody asked for about a string that was
 * never trustworthy. The question being answered is "does this match what I
 * remember", and that needs one short phrase.
 *
 * Pure, so the whole table of cases can be tested without a browser.
 */

/**
 * The device, as a phrase that follows "on".
 *
 * Returns an empty string when the string says nothing useful, which is the
 * honest answer for a bot, a blank, or anything unrecognised. A record that
 * guesses is worse than a record that is quiet: this one exists to be relied
 * on in an argument.
 */
export function whatTheySignedOn(agent: string | null | undefined): string {
  if (!agent) return "";

  const ua = agent.toLowerCase();

  /*
   * iPad first, because an iPad calls itself a Macintosh in desktop mode and
   * would otherwise be filed as a computer. Checked on the tablet hint that
   * survives that disguise.
   */
  if (ua.includes("ipad")) return "an iPad";
  if (ua.includes("iphone")) return "an iPhone";
  if (ua.includes("ipod")) return "an iPod";

  /* Android says "mobile" when it is a phone and omits it when it is a tablet. */
  if (ua.includes("android")) {
    return ua.includes("mobile") ? "an Android phone" : "an Android tablet";
  }

  if (ua.includes("windows")) return "a Windows computer";

  /*
   * Macintosh after iPad, and after a touch hint: Safari on an iPad in desktop
   * mode sends a Macintosh string with "macintosh" and no "ipad" at all, and
   * the only thing separating the two is that the iPad claims touch points.
   */
  if (ua.includes("macintosh") || ua.includes("mac os")) {
    return ua.includes("touch") ? "an iPad" : "a Mac";
  }

  if (ua.includes("cros")) return "a Chromebook";
  if (ua.includes("linux")) return "a Linux computer";

  return "";
}

/**
 * The whole sentence under a signed form.
 *
 * Built here rather than in the page so the order and the punctuation can be
 * tested, and so the several ways it can be incomplete — no IP, no device,
 * neither — each produce a sentence rather than a gap with a stray "from" in
 * it.
 */
export function signedRecord(args: {
  /** Already formatted for reading. */
  when: string;
  ip: string | null;
  agent: string | null;
}): string {
  const device = whatTheySignedOn(args.agent);

  const parts = [
    `Submitted ${args.when}`,
    device ? `on ${device}` : "",
    args.ip ? `from ${args.ip}` : "",
  ].filter(Boolean);

  return `${parts.join(" ")}.`;
}
