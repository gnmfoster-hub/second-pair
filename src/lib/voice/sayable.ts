/**
 * Turning a written reply into something worth hearing.
 *
 * Giles, after the first real call: "it reads out the privacy link which is
 * bad, should really send it."
 *
 * He is right, and it is worse than untidy — a URL read aloud is unusable.
 * Nobody can write down "https colon slash slash www dot second dash pair dot
 * com slash privacy" while holding a phone, and every second spent saying it
 * is a second the caller spends waiting to say what they actually rang about.
 *
 * The assistant writes for a screen, because that is what every other channel
 * is. So the voice path translates rather than asking the model to remember:
 * a rule beats an instruction, and an instruction to never include a link
 * fails on the day it matters.
 *
 * Links are not dropped. They go by text after the call, which is the medium
 * a link belongs in and the thing the caller can actually tap.
 */

/** Anything that looks like a web address or a bare domain. */
const LINK =
  /\b(?:https?:\/\/|www\.)[^\s<>]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co\.uk|uk|org|net|io)\b[^\s<>]*/gi;

export type Spoken = {
  /** What to say out loud. */
  said: string;
  /** Every link taken out, in the order they appeared, to be texted after. */
  links: string[];
};

export function sayable(reply: string): Spoken {
  const links: string[] = [];

  let said = reply.replace(LINK, (match) => {
    links.push(match);
    return "";
  });

  /*
   * Tidying what the removal leaves behind.
   *
   * "Everything you need is here: — any questions, just ask" is what a naive
   * strip produces, and it sounds like a fault. Colons and dangling
   * punctuation left pointing at nothing go with the link.
   */
  said = said
    .replace(/\s*[:—-]\s*(?=[.,!?]|$)/gm, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.,!?])\1+/g, "$1")
    .trim();

  /*
   * And say where it went, once, at the end.
   *
   * Without this the caller is simply not told about a thing that was meant
   * for them — worse than reading it out, because at least that admitted the
   * link existed.
   */
  if (links.length) {
    const what = links.length === 1 ? "the link" : "the links";
    said = said ? `${said} I will text you ${what}.` : `I will text you ${what}.`;
  }

  return { said, links };
}
