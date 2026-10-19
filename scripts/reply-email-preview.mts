/*
 * What a reply from the assistant looks like as an email.
 *
 *   npx tsx scripts/reply-email-preview.mts
 *
 * Writes the html next to this and opens nothing. These are the two emails
 * the product sends most of — a reply to somebody who wrote in, and the same
 * answer offered on from the widget — and until today both went as text
 * alone, set in whatever the reader's mail client defaults to.
 *
 * Sends nothing and reads nothing. The wording is a real answer, copied from
 * a conversation, because a sample that says "Hello world" proves the markup
 * and not the layout.
 */
import fs from "node:fs";
import { asEmail } from "../src/lib/messaging/asEmail.ts";

const cases = [
  {
    file: "reply-amber.html",
    businessName: "Amber's Paws & Pastures",
    firstName: "Julie",
    about: "Dog walking",
    canReply: true,
    photoUrl: null,
    body:
      "Thursday at two is free, and so is Friday at ten if that suits you better.\n" +
      "A walk is an hour, door to door.\n" +
      "Shall I put you in for the Thursday?",
  },
  {
    file: "reply-neat-tidy.html",
    businessName: "Neat & Tidy Solutions",
    firstName: null,
    about: null,
    canReply: false,
    photoUrl: null,
    body:
      "Hi there, thanks for getting in touch.\n\n" +
      "Karen does the quotes herself and she is out on jobs until about five. " +
      "She will come back to you this evening with a price.\n\n" +
      "If it is easier, the number is on the website and she picks up between jobs.",
  },
];

for (const c of cases) {
  const { subject, text, html } = asEmail(c);
  fs.writeFileSync(new URL(c.file, import.meta.url), html);
  console.log(`\n── ${c.businessName} ─────────────────────────────`);
  console.log(`subject: ${subject}`);
  console.log(`html:    ${c.file}  (${html.length} characters)`);
  console.log(`\n${text}\n`);
}
