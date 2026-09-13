/**
 * How to ask somebody for a photo, which is not the same on every channel.
 *
 * The prompt told everybody "there is a paperclip in the chat window they can
 * attach photos with, so point them at it", whatever they were writing from.
 * The paperclip is on the widget and nowhere else — so a customer texting a
 * tattoo studio was sent hunting for a control that does not exist on their
 * phone. The assistant describing its own screen to somebody who cannot see
 * it, which is the quickest way to sound like a machine that does not know
 * where it is.
 *
 * Photos do arrive by text, and from Messenger and Instagram; both webhooks
 * have always read the media off them. So what is being asked for is the same
 * everywhere, and only the asking changes.
 *
 * In a file of its own, with nothing imported, because the prompt it belongs
 * to cannot be loaded by the test runner — it imports through the `@/` alias,
 * which node's resolver knows nothing about. That is why nothing in the prompt
 * has ever had a test, and why a line of it could be wrong for every customer
 * on every channel but one without anything noticing.
 */
export function howToSendPhotos(channel: string): string {
  if (channel === "web") {
    return "- Reference images — there is a paperclip in the chat window they can attach photos with, so point them at it";
  }

  return (
    "- Reference images — ask them to send a photo or two, attached to their reply the way they " +
    "would send one to anybody. Never mention a paperclip, a button or a chat window: they are " +
    "not on our website, they are in their own messages app."
  );
}
