/**
 * The two numbers a text channel is made of, and what is wrong with them.
 *
 * Pulled out of the forms that read them because the owner's own settings page
 * and the back office ask exactly the same questions, and a support screen that
 * is more forgiving than the page it stands in for is worse than useless: the
 * person typing is not the person it fails for.
 *
 * Nothing here touches the database. Whether a number already belongs to
 * somebody else is a question only the database can answer.
 */

/** Twilio addresses everything in full international form. Nothing else matches. */
const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;

/** How people write numbers, against how Twilio stores them. */
export function tidyNumber(raw: string): string {
  return raw.trim().replace(/[\s()\-.]/g, "");
}

export type Numbers =
  | {
      ok: true;
      /** Null means: take this number away. */
      number: string | null;
      forwardTo: string | null;
    }
  | { ok: false; error: string };

export function readNumbers(rawNumber: string, rawForward: string): Numbers {
  const number = tidyNumber(rawNumber);
  const forward = tidyNumber(rawForward);

  /*
   * Blank is a real answer in both boxes, and a different one in each.
   *
   * No business number means hand the number back. No ring-me number means
   * text the caller at once and do not let the phone ring at all — which is
   * what somebody with their hands full most of the day actually wants, not an
   * unfinished setting.
   */
  const forwardTo = forward || null;

  if (forwardTo && !INTERNATIONAL.test(forwardTo)) {
    return {
      ok: false,
      error:
        "The number to ring needs full international form too, like +447700900123. " +
        "Leave it empty to text people straight away instead.",
    };
  }

  if (!number) return { ok: true, number: null, forwardTo };

  if (!INTERNATIONAL.test(number)) {
    return {
      ok: false,
      error:
        "Use the full international number, starting with +. A UK mobile looks " +
        "like +447700900123.",
    };
  }

  /*
   * A call arriving on the business number is forwarded to the ring-me number.
   * The same number in both boxes forwards the call to itself, which nobody
   * notices until a customer is sitting in it.
   */
  if (forwardTo === number) {
    return {
      ok: false,
      error:
        "The ring-me number is the same as the business number, so a call would " +
        "ring itself. Use their own mobile, or leave it empty.",
    };
  }

  return { ok: true, number, forwardTo };
}

/**
 * Whether to ring the owner's own phone, or text the caller straight away.
 *
 * A business can keep the number its customers already have by asking its
 * network to divert calls it does not answer to the number we hold. That is
 * the right way to do it, and it puts this webhook one hop downstream of a
 * phone that has already rung.
 *
 * Ringing that same phone again from here is at best pointless and at worst a
 * loop: we ring their mobile, their mobile diverts it back to us, and the two
 * numbers pass the same call between them, billed each way, until something
 * gives up. The settings page says to leave the ring-me number empty when
 * diverting, and people will not read it — so this notices instead.
 *
 * `forwardedFrom` is the number the call was diverted from, which the carrier
 * passes on. When it is absent, nothing is known and the ordinary answer
 * applies.
 */
export function shouldRing(
  forwardTo: string | null,
  forwardedFrom: string | null | undefined,
  ourNumber: string,
): boolean {
  if (!forwardTo) return false;

  const from = tidyNumber(forwardedFrom ?? "");
  if (!from) return true;

  // Diverted from the phone we were about to ring: it has already rung.
  if (from === tidyNumber(forwardTo)) return false;

  // Diverted from our own number, which can only be something looping.
  if (from === tidyNumber(ourNumber)) return false;

  return true;
}

/**
 * A number as somebody would read it out, rather than as a line stores it.
 *
 * Everything internal is full international form, because that is the only
 * shape that routes. It is also the shape nobody recognises as their own
 * number: +447460076593 has to be decoded before a person can check it against
 * the one on their van, and a number a business cannot check at a glance is a
 * number they will not confidently put on their website.
 *
 * Only UK numbers are reshaped, since those are the only ones whose grouping
 * is worth asserting. Anything else is handed back untouched, which is correct
 * rather than lazy: a wrongly grouped foreign number reads as a typo.
 */
export function readableNumber(raw: string): string {
  const n = tidyNumber(raw);

  // UK mobile: +447xxx xxxxxx, said as 07xxx xxxxxx.
  const mobile = /^\+447(\d{3})(\d{6})$/.exec(n);
  if (mobile) return `07${mobile[1]} ${mobile[2]}`;

  // UK landline, as one group after the leading zero. Area codes vary in
  // length and guessing the split wrongly is worse than not splitting.
  const uk = /^\+44(\d{9,10})$/.exec(n);
  if (uk) return `0${uk[1]}`;

  return n || raw;
}

/**
 * One shape for a number, so the same person is the same person.
 *
 * A customer types 07700 900312. The number the same customer arrived on by
 * text is stored as +447700900312. Compared literally those are two different
 * people, so the salon ends up with two records for one regular — her history
 * split, her "usually with" wrong, and anything recorded against her, like the
 * twenty minutes extra her colour needs, attached to the half of her that is
 * not being booked.
 *
 * That is not hypothetical. It happened on the demo the first time a real
 * conversation was run through it, and it would have happened to every
 * business with every customer who types their number the way people do.
 *
 * UK only, deliberately. A leading zero means a national number and the
 * country is knowable; anything already international is left exactly as it
 * is, and anything else is tidied and no more, because guessing a country code
 * is how you merge two people who are not the same person at all.
 */
export function samePhone(raw: string | null | undefined): string {
  const tidy = tidyNumber(String(raw ?? ""));
  if (!tidy) return "";

  if (tidy.startsWith("+")) return tidy;

  // 07700900312 → +447700900312
  if (/^0\d{9,10}$/.test(tidy)) return `+44${tidy.slice(1)}`;

  // 447700900312, as some providers hand it over.
  if (/^44\d{9,10}$/.test(tidy)) return `+${tidy}`;

  return tidy;
}
