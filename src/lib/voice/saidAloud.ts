/**
 * Turning what the assistant wrote into what a voice should read.
 *
 * Giles, after a test call: it mispronounces things.
 *
 * It does, and the reason is that every word on this call was written for a
 * screen. The assistant is the same one that answers texts, which is the whole
 * point of it — same prices, same diary, same refusals — but a text is read
 * and a call is heard, and a handful of things that are perfectly clear in
 * writing are wrong out loud:
 *
 *   "Neat & Tidy"   an ampersand is a shape, not a word. Polly usually gets it
 *                   and sometimes says nothing at all, which turns a business's
 *                   name into "Neat Tidy" on the one sentence it cannot afford
 *                   to get wrong.
 *   "£45"           read back-to-front by some engines, and "£45.50" becomes
 *                   "forty five point five zero" rather than "fifty".
 *   "9:30am"        colons and am/pm are punctuation to a reader and a guess to
 *                   a speaker.
 *   "EX1 2AB"       a postcode is letters and digits, and any engine that meets
 *                   one tries to say it as a word.
 *   "0800 123 4567" a phone number read as "eight hundred, one hundred and
 *                   twenty three" is unusable, and reading a number back is
 *                   half of what a receptionist does.
 *   "Mon–Fri"       an en dash is silence; "9-5" is a range, not minus.
 *
 * ── Rewriting rather than SSML ──────────────────────────────────────────────
 *
 * The obvious tool is SSML — <say-as interpret-as="telephone">, <phoneme> and
 * so on. It is not used here, and deliberately.
 *
 * Every one of these strings is built by a language model and then escaped into
 * XML. Wrapping model output in tags means deciding, at runtime, where a tag
 * opens and closes inside a sentence nobody wrote by hand; get it wrong and
 * Twilio cannot parse the document, which does not degrade — the call drops,
 * silently, and the business never learns there was an enquiry. That is the
 * single worst failure this product has, and it is not worth risking to smooth
 * a postcode.
 *
 * Plain words cannot break a document. The worst a bad rewrite here can do is
 * sound slightly odd, which is the failure we are already trying to fix.
 *
 * Pure, and tested case by case, because every rule here is a guess about an
 * engine's behaviour and the only way to keep those guesses honest is to write
 * down what each one is for.
 */

/** £1,250.50 → "one thousand two hundred and fifty pounds fifty" is overkill.
 *  "1250 pounds 50" is what a person says and what every engine reads right. */
function money(pounds: string, pence?: string): string {
  const whole = pounds.replace(/,/g, "");
  if (!pence || pence === "00") return `${whole} pounds`;
  /* "45.5" written by a model means fifty pence, not five. */
  const p = pence.length === 1 ? `${pence}0` : pence;
  return `${whole} pounds ${p}`;
}

/**
 * What to say instead of what was written.
 *
 * Applied to the spoken half only. The written half — the text that follows a
 * call, the message in the inbox — keeps every symbol exactly as the assistant
 * wrote it, because those are read.
 */
export function saidAloud(written: string): string {
  let out = written;

  /*
   * Money first, before anything else touches a full stop or a digit.
   * £45, £45.50, £1,250 and £1,250.50 all arrive here.
   */
  out = out.replace(/£\s?(\d[\d,]*)(?:\.(\d{1,2}))?/g, (_, pounds: string, pence?: string) =>
    money(pounds, pence),
  );

  /*
   * Times. "9:30am" → "9 30 am", "14:00" → "14 00". Said as two numbers, which
   * is how a person says a time and what every engine reads correctly; the
   * alternative is teaching it "half past" and being wrong about "quarter to".
   */
  out = out.replace(/\b(\d{1,2}):(\d{2})\s?(am|pm)?/gi, (_, h: string, m: string, ap?: string) =>
    `${h} ${m === "00" ? "o'clock" : m}${ap ? ` ${ap.toLowerCase()}` : ""}`,
  );

  /*
   * Telephone numbers: digits, spaced, so they are read one at a time.
   * Matched on a run of digits long enough to be a number and not a price or a
   * year — ten or more, which is every UK number and nothing else we say.
   */
  out = out.replace(/\b(\+?\d[\d\s]{9,})\b/g, (match: string) => {
    const digits = match.replace(/\s/g, "");
    if (digits.replace(/\D/g, "").length < 10) return match;
    return digits.split("").join(" ");
  });

  /*
   * Postcodes, said letter by letter and number by number, which is how they
   * are given over a phone. UK format, loosely: it does not need to reject a
   * bad one, only to catch a real one.
   */
  out = out.replace(
    /\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})\b/g,
    (_, outward: string, inward: string) =>
      `${outward.split("").join(" ")} ${inward.split("").join(" ")}`,
  );

  /*
   * The ampersand, which is the one that matters most: it is in a business's
   * name and the name is the first thing said on every call.
   */
  out = out.replace(/\s*&\s*/g, " and ");

  /* Dashes between words or numbers are a range, and silence if left alone. */
  out = out.replace(/(\w)\s*[–—]\s*(\w)/g, "$1 to $2");
  out = out.replace(/\b(\d{1,2})\s?-\s?(\d{1,2})\b/g, "$1 to $2");

  /*
   * Shorthand a reader expands silently and a speaker says as a word.
   * Deliberately short: every entry is a guess, and a wrong guess here is a
   * sentence that sounds stranger than the one it replaced.
   */
  const words: [RegExp, string][] = [
    [/\bMon\b/g, "Monday"],
    [/\bTue(s)?\b/g, "Tuesday"],
    [/\bWed\b/g, "Wednesday"],
    [/\bThu(r|rs)?\b/g, "Thursday"],
    [/\bFri\b/g, "Friday"],
    [/\bSat\b/g, "Saturday"],
    [/\bSun\b/g, "Sunday"],
    [/\bapprox\.?\b/gi, "about"],
    [/\bmins\b/gi, "minutes"],
    [/\bhrs\b/gi, "hours"],
    /* No trailing \b after a full stop: a dot is not a word character, so
       there is no boundary between it and the space that follows, and the
       rule silently never fires. Caught by the test, not by reading it. */
    [/\be\.g\./gi, "for example"],
    [/\bi\.e\./gi, "that is"],
    [/\betc\.?/gi, "and so on"],
  ];
  for (const [pattern, say] of words) out = out.replace(pattern, say);

  /* Whatever the rules above left behind. */
  return out.replace(/\s{2,}/g, " ").trim();
}
