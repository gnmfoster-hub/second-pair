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
  allowed,
  subscribed,
  ownEmail,
}: {
  firstName: string;
  business: string;
  mine: { channel: Channel; label: string | null; external_id: string | null }[];
  shared: { channel: Channel }[];
  /** Channels the owner has allowed them their own of. See lib/channels/whose. */
  allowed?: string[] | null;
  /**
   * What the business pays for at all, which is the gate above the owner's.
   *
   * A channel nobody is subscribed to is not a thing to offer, to explain or
   * to say is switched off: it is not on the shelf, and listing it would have
   * every stylist asking their owner for something the owner cannot give.
   */
  subscribed?: string[] | null;
  /**
   * Their own address, where email is one of the allowed ones.
   *
   * Worked out by the page rather than here, because it is made of the
   * business's slug and their handle and neither belongs in a panel.
   */
  ownEmail?: string | null;
}) {
  const sharedNames = [...new Set(shared.map((c) => CHANNEL_LABELS[c.channel]))];

  /*
   * The three gates, worked out once.
   *
   * subscribed is the business paying for the channel at all, which is ours to
   * decide; allowed is the owner saying this person may have their own of it;
   * connected is whether there is anything on them yet. The first two decide
   * whether a channel is on this page. The third only decides what it says.
   *
   * web is never here: it is the widget on the business's own site and there
   * is no personal version of it to have.
   */
  const paidFor = (subscribed ?? []).filter((c) => c !== "web");
  const mayHave = new Set(allowed ?? []);

  const hers = paidFor
    .filter((c) => mayHave.has(c))
    .map((channel) => ({
      channel: channel as Channel,
      connected: mine.find((m) => m.channel === channel) ?? null,
    }));

  const theirs = paidFor.filter((c) => !mayHave.has(c)) as Channel[];

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
        * Every channel she is actually allowed, not the two this was written for.
        *
        * Giles: all channels and the ability to set them up should show for
        * every team member, if the owner has turned it on and the business is
        * subscribed to it. This panel handled Instagram and Facebook and said
        * one sentence about numbers, so a stylist allowed six channels was
        * told about two of them.
        *
        * Three gates, in this order, and they are genuinely different things:
        *
        *   subscribed  the business pays for that channel at all. Ours.
        *   allowed     the owner has said this person may have their own.
        *   connected   there is an account or a number on them.
        *
        * Only the first two decide whether a channel appears here. The third
        * decides what it says, because "you are allowed one and there isn't one
        * yet" and "you are not allowed one" are completely different answers
        * and used to read identically.
        */}
      {hers.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <span className="label">Your own, on this business</span>
          <ul className="mt-2 space-y-3">
            {hers.map(({ channel, connected }) => (
              <li key={channel}>
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="text-sm font-medium">{CHANNEL_LABELS[channel]}</span>
                  {connected ? (
                    <span className="hint num">
                      {channel === "sms" || channel === "voice"
                        ? readableNumber(connected.external_id ?? "")
                        : (connected.label ?? "connected")}
                    </span>
                  ) : (
                    <span className="pill bg-surface-2 text-muted">Not set up yet</span>
                  )}
                </div>

                {/* What to do about it, which differs by who is able to act. */}
                {channel === "email" && ownEmail && (
                  <>
                    <p className="num mt-1.5 break-all rounded-lg bg-surface-2 px-3 py-2 text-[0.85rem]">
                      {ownEmail}
                    </p>
                    <p className="hint mt-1.5">
                      Yours already, nothing to set up. Anything sent here reaches only you,
                      and the assistant books it straight into your diary without asking who
                      the customer wants. Worth putting on your own card or in your Instagram
                      bio.
                    </p>
                  </>
                )}

                {(channel === "instagram" || channel === "messenger") && !connected && (
                  <>
                    <a href="/api/meta/connect/start?mine=1" className="btn-ghost mt-1.5 inline-flex">
                      Connect my own {CHANNEL_LABELS[channel]}
                    </a>
                    <p className="hint mt-1.5">
                      You log in to Facebook yourself and choose what to share. Nobody here
                      sees your password, and you can disconnect from your own Facebook
                      settings at any time without telling us.
                    </p>
                  </>
                )}

                {(channel === "sms" || channel === "voice" || channel === "whatsapp") &&
                  !connected && (
                    <p className="hint mt-1.5">
                      A number of your own comes with {business}&rsquo;s Second Pair
                      subscription, and whoever runs {business} allocates it. They are paid
                      for monthly and have to be registered to a real address, so nobody on
                      the team can add one themselves. Ask them and it will appear here.
                    </p>
                  )}

                {connected && (channel === "sms" || channel === "voice") && (
                  <p className="hint mt-1.5">
                    Set up for you by whoever runs {business}. Everything arriving on it is
                    yours, and the assistant never asks the customer who they would like.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        * And the ones the owner has not switched on.
        *
        * Said as a fact rather than left as a missing button. "Not switched on
        * for you" is a thing to ask about; an absence is a thing to report as
        * broken, which is how this arrived on my desk in the first place.
        */}
      {theirs.length > 0 && (
        <p className="hint mt-4 border-t border-border pt-4">
          {orList(theirs.map((c) => CHANNEL_LABELS[c]))} of your own{" "}
          {theirs.length === 1 ? "is" : "are"} not switched on for you. Whoever runs{" "}
          {business} decides that, because anything arriving on one would come straight to
          you rather than being offered round.
        </p>
      )}

    </section>
  );
}

/** "texts and email", "texts, email and Instagram". */
function orList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
