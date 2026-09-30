/**
 * What an agreement is, and where it has got to.
 *
 * Pure, and importable from anywhere. It was all in read.ts beside the query
 * until the build refused it: read.ts needs siteOrigin() to make the link, and
 * siteOrigin reads next/headers, which is server-only. The back office panel is
 * a client component and imports whereItGot, so one import pulled next/headers
 * towards the browser and the whole build stopped.
 *
 * A good failure, and worth the split rather than a workaround: the shape of an
 * agreement and the words for its state have no business knowing how a URL is
 * put together.
 */

import type { Line } from "./terms";

export type AgreementRow = {
  id: string;
  studioId: string;
  setupFeePence: number;
  recurringPence: number;
  period: string;
  trialEndsOn: string | null;
  includes: string[];
  noticeDays: number;
  noticeGivenOn: string | null;
  endsOn: string | null;
  termsVersion: string;
  /**
   * The wording, exactly as it was sent.
   *
   * Carried into the back office rather than left on the public page, because
   * the one moment anybody needs to read a signed agreement is when there is a
   * disagreement about it - and following a client's own private link to find
   * out what we agreed is a strange way to run a company.
   */
  termsText: string;
  /**
   * The priced schedule as sent, where there is one.
   *
   * Empty for every agreement written before 30 September, and empty until the
   * lines migration has run - which is why it is an array rather than optional,
   * so nothing downstream has to ask which of those two it is looking at.
   */
  lines: Line[];
  sentTo: string | null;
  sentAt: string | null;
  openedAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  voidAt: string | null;
  /**
   * The private link, whole, rather than the raw token.
   *
   * Built on the server, where the address is known, so no screen has to work out
   * how one is put together. The commonest thing anybody will ever want from the
   * back office is to send a client their link again because they have lost the
   * email, and a bare token is not that.
   */
  link: string | null;
};

/**
 * Where an agreement has got to, in the words somebody would use.
 *
 * Four states, and the distinction that matters is between the two nobody thinks
 * to separate: "sent and not looked at" and "looked at and not signed". The first
 * is a chase about the email; the second is a chase about the terms, and they
 * want different phone calls.
 */
export function whereItGot(row: AgreementRow): {
  state: "withdrawn" | "signed" | "read" | "sent";
  said: string;
} {
  if (row.voidAt) return { state: "withdrawn", said: "Withdrawn" };
  if (row.signedAt) {
    return {
      state: "signed",
      said: row.signerName ? `Signed by ${row.signerName}` : "Signed",
    };
  }
  if (row.openedAt) return { state: "read", said: "Opened, not signed yet" };
  return { state: "sent", said: "Sent, not opened yet" };
}
