import { StripeNotice } from "./StripeNotice";

/**
 * Connecting the business's own Stripe, on the page about getting paid.
 *
 * It used to live halfway down the business settings page, under "Taking the
 * money", which was fine while everything was one long page. Grouping the
 * settings moved getting paid onto a page of its own and left this behind — so
 * a business on the one-account model opened Getting paid, found the switches
 * for a thing it could not do, and no way anywhere to connect an account. The
 * only connect links on that page were the ones for the account-each model.
 *
 * Its own panel rather than part of the form above, because that is a form and
 * these are links.
 */
export function BusinessStripe({
  accountId,
  canConnect,
  sandbox = false,
  outcome,
  detail,
}: {
  /** The connected account, or null. */
  accountId: string | null;
  /**
   * Whether connecting works at our end at all. False means the platform key
   * is not set and the button would send somebody to Stripe and bounce them
   * straight back.
   */
  canConnect: boolean;
  /**
   * True when the account this would connect is a sandbox one, on a real
   * business. Second Pair's own switch to live keys, not anything the owner
   * can do — so it is said plainly rather than hidden behind a disabled button.
   */
  sandbox?: boolean;
  /** The ?stripe= word, when they have just come back from Stripe. */
  outcome?: string;
  detail?: string;
}) {
  return (
    <div className="card p-5">
      <div className="section-title">The business&rsquo;s Stripe</div>

      <p className="hint mt-1.5 max-w-prose">
        Your customers pay <strong>you</strong> directly. The money never passes through
        Second Pair, and refunds and disputes stay in your own Stripe account, where you
        can see them.
      </p>

      <div className="mt-4 space-y-2.5">
        <StripeNotice outcome={outcome} detail={detail} />

        {sandbox && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
            <strong>Card payments are still in test mode at our end.</strong> Connecting now
            attaches a practice account, and no real card can be charged through it — you
            would have to connect again once we switch over. We will tell you when that is;
            everything else here works in the meantime.
          </p>
        )}

        {accountId ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="pill bg-ok/10 text-ok">Connected</span>
            <span className="hint font-mono text-xs">{accountId}</span>
            {canConnect && (
              <a href="/api/stripe/connect/start" className="btn-ghost">
                Connect a different account
              </a>
            )}
          </div>
        ) : canConnect ? (
          <>
            <a
              href="/api/stripe/connect/start"
              className="btn inline-flex bg-accent text-on-accent"
            >
              Connect Stripe
            </a>
            <p className="hint max-w-prose">
              You will be taken to Stripe to sign in, or to open an account if you have not
              got one. Only the owner can do this, because Stripe asks for their ID and the
              business&rsquo;s bank details.
            </p>
          </>
        ) : (
          /*
           * No live button, because there is nothing behind it. Somebody who
           * presses a control that lands them back on the same page concludes
           * the product is broken, and they are not wrong — only wrong about
           * which part.
           */
          <>
            <span className="btn inline-flex pointer-events-none opacity-50" aria-disabled="true">
              Connect Stripe
            </span>
            <p className="hint max-w-prose">
              Card payments are not switched on at our end yet, so there is nothing to
              connect to. This one is on Second Pair rather than on you, we will tell
              you when it is ready. Everything else keeps working; the assistant simply will
              not ask anybody for a deposit.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
