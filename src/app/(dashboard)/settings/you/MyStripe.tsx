/**
 * Connecting your own Stripe, where the money is yours rather than the shop's.
 *
 * A salon with employees has one account and the owner settles up; a salon of
 * chair renters is a row of separate businesses sharing a room, and each
 * person's takings were never the shop's to hold. The second kind is the whole
 * reason the per-person model exists — and until now there was no way for
 * anybody but the owner to connect an account, so on that model every payment
 * either fell back to the business or was refused outright. The column the
 * decision reads has been there since payments were built and nothing could
 * write it.
 *
 * Only that person can do this, and that is not a limitation to apologise for.
 * Stripe asks for a passport and a bank account; neither is the owner's to
 * hand over, and an owner who could start it "for" somebody would be inviting
 * them to put their ID into a flow a colleague began.
 */
export function MyStripe({
  connected,
  perPerson,
  firstName,
}: {
  /** Whether this person already has an account of their own. */
  connected: boolean;
  /**
   * Whether this business pays each person directly. On the one-account model
   * a personal account would receive nothing, so it is explained rather than
   * offered.
   */
  perPerson: boolean;
  firstName: string;
}) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">Getting paid</h2>
          <p className="hint mt-1 max-w-prose">
            {perPerson ? (
              <>
                This business pays each person directly, so card payments for your work
                land in your own Stripe account &mdash; never the shop&rsquo;s, and never
                ours. You connect it yourself because Stripe asks for your ID and your
                bank details, and those are nobody else&rsquo;s to hand over.
              </>
            ) : (
              <>
                This business takes card payments into one account for the whole shop, so
                there is nothing for you to connect &mdash; whoever runs it settles up with
                you however you already arrange it.
              </>
            )}
          </p>
        </div>

        {connected && (
          <span className="pill shrink-0 bg-ok/10 text-ok">Connected</span>
        )}
      </div>

      {perPerson && !connected && (
        <>
          {/*
            * A link rather than a form. It leaves for Stripe and comes back to
            * this page, and a button that posted first would only add a step
            * between somebody deciding and somebody arriving.
            */}
          <a href="/api/stripe/connect/start?mine" className="btn mt-4 inline-flex bg-accent text-on-accent">
            Connect my Stripe
          </a>
          <p className="hint mt-2 max-w-prose">
            Until you do, {firstName}, a card payment for your work cannot be taken
            &mdash; it is refused rather than quietly going somewhere else, which is the
            safer of the two.
          </p>
        </>
      )}

      {perPerson && connected && (
        <p className="hint mt-3 max-w-prose">
          Money for your work goes straight to you. Refunds, disputes and the payouts
          themselves are between you and Stripe &mdash; it never passes through us, and we
          could not hold it if we wanted to.
        </p>
      )}
    </section>
  );
}
