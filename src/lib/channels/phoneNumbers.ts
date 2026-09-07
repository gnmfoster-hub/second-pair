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
