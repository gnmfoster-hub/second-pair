import { readableNumber } from "@/lib/channels/phoneNumbers";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";

/**
 * How somebody is reached, on their own settings page.
 *
 * Giles, looking at Aisha's screen: she cannot add her own channels, and the
 * owner's view of her says they are coming. Both true, and between them they
 * told her nothing at all about how a customer reaches her today — which is
 * the question she would actually be asking.
 *
 * She is reachable, and has been all along. The business has a number, a
 * customer texts it, and the assistant asks who they would like before it
 * books. Her own line would change one thing: it would stop asking, because
 * everything arriving there is hers. That is worth saying plainly on the page
 * where she looks, whether or not she has one.
 *
 * Read-only on purpose. A person taking their own line changes how every
 * future customer reaches that business, and the person it routes away from is
 * the last one who should be able to do it quietly — so the owner decides, and
 * this says who to ask.
 */
export function MyChannels({
  firstName,
  business,
  /** Channels connected to this person by name. Usually none. */
  mine,
  /** Channels the business has that reach everybody, including them. */
  shared,
}: {
  firstName: string;
  business: string;
  mine: { channel: Channel; label: string | null; external_id: string | null }[];
  shared: { channel: Channel }[];
}) {
  const sharedNames = [...new Set(shared.map((c) => CHANNEL_LABELS[c.channel]))];

  return (
    <section className="card p-5">
      <h2 className="section-title">How people reach you</h2>

      {mine.length > 0 ? (
        <>
          <p className="hint mt-1">
            These are yours. Anything arriving on them is for {firstName} — the assistant
            knows that already and never asks the customer who they would like.
          </p>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {mine.map((c) => (
              <li key={`${c.channel}-${c.external_id}`} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
                <span className="text-sm font-medium">{CHANNEL_LABELS[c.channel]}</span>
                <span className="hint num">
                  {c.channel === "sms" || c.channel === "voice"
                    ? readableNumber(c.external_id ?? "")
                    : (c.label ?? "connected")}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint mt-1">
          Nothing is yours alone yet, and you are still reachable.{" "}
          {sharedNames.length > 0 ? (
            <>
              {business} has {sharedNames.length === 1 ? "a" : ""} {orList(sharedNames)}, and a
              customer writing in is asked who they would like before anything is booked — so
              they can ask for {firstName} by name.
            </>
          ) : (
            <>
              {business} has no channel connected yet, so nothing is reaching anybody. Whoever
              runs it can set one up.
            </>
          )}
        </p>
      )}

      {/*
       * What a line of their own would actually change, said as behaviour
       * rather than as a feature. "You can have your own number" means nothing;
       * "it would stop asking who they want" is the whole difference.
       */}
      <p className="hint mt-3">
        {mine.length > 0
          ? "Ask whoever runs the business if this should change — they decide, because it changes how every new customer reaches the place."
          : `A number or an account of your own would change one thing: the assistant would stop asking who the customer wants, because everything arriving on it is yours. Whoever runs ${business} decides that, so ask them.`}
      </p>
    </section>
  );
}

/** "texts and email", "texts, email and Instagram". */
function orList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
