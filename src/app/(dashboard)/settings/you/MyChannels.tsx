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
 * Split by who can actually log in, which is the honest line.
 *
 * A number is bought and paid for by the business, costs money every month and
 * has to be registered to a real address, so the owner buys it and decides
 * whose it is — nobody on the team can conjure one, and a person taking a line
 * changes how every future customer reaches the place.
 *
 * Her own Instagram is the opposite, for the same reason Stripe on this page
 * already gives: only she can log in to it. An owner cannot connect a
 * stylist's Instagram on her behalf without her password and should not want
 * to. So that half is hers to press, and it arrives with her name on it.
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
       * The two halves of this, which are not the same job.
       *
       * A number is bought and paid for by the business — it costs money every
       * month and has to be registered to a real address — so the owner buys it
       * and decides whose it is. Nobody on the team can conjure one.
       *
       * Her own Instagram is the opposite, and for exactly the reason Stripe on
       * this same page already gives: only she can log in to it. An owner
       * cannot connect a stylist's Instagram on her behalf without her
       * password, and should not want to. So that one is hers to press.
       */}
      <div className="mt-4 border-t border-border pt-4">
        <span className="label">An account of your own</span>
        <p className="hint mt-1.5">
          Your own Instagram or Facebook, rather than {business}&rsquo;s. You log in to
          Facebook yourself and choose what to share &mdash; nobody here sees your
          password, and you can disconnect from your own Facebook settings at any time
          without telling us.
        </p>
        <a href="/api/meta/connect/start?mine=1" className="btn-ghost mt-2.5 inline-flex">
          Connect my own Instagram or Facebook
        </a>
        <p className="hint mt-2">
          Anything you connect here is yours: enquiries arriving on it are for {firstName},
          and the assistant books them straight into your diary without asking who the
          customer wants.
        </p>
      </div>

      <p className="hint mt-4">
        {mine.some((c) => c.channel === "sms" || c.channel === "voice")
          ? "Your number was set up for you — whoever runs the business buys and allocates those, because they are paid for monthly and have to be registered to a real address."
          : `A number of your own is not something you can add yourself: they are bought and paid for monthly by the business and have to be registered to a real address. Ask whoever runs ${business} if you need one.`}
      </p>
    </section>
  );
}

/** "texts and email", "texts, email and Instagram". */
function orList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
