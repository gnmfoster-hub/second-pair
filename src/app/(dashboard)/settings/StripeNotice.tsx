/**
 * What happened when somebody came back from Stripe.
 *
 * Every one of these outcomes already existed. The connect routes have always
 * redirected to `/settings?stripe=…` with a word saying how it went — and
 * nothing on either settings page has ever read that parameter, so all of them
 * rendered as nothing at all. Pressing "Connect Stripe" without the platform
 * key set sent somebody to Stripe's door, bounced them straight back, and
 * showed them the same page they started on: indistinguishable from a button
 * that does not work.
 *
 * Shared by the business's panel and each person's own, because the same
 * flow serves both and two copies would drift.
 */
const OUTCOMES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: {
    tone: "ok",
    text: "Connected. Card payments now land in that Stripe account.",
  },
  cancelled: {
    tone: "warn",
    text: "Nothing was connected — you stopped at Stripe. No harm done.",
  },
  "owner-only": {
    tone: "warn",
    text: "Only the owner can connect the business account, because it decides where the money lands.",
  },
  expired: {
    tone: "warn",
    text: "That took too long, or the link was tampered with. Press connect again.",
  },
  refused: {
    tone: "warn",
    text: "Stripe would not finish. Nothing was changed — try again, and tell us if it happens twice.",
  },
  /*
   * The one an owner cannot act on, and so the one that has to say whose
   * problem it is. Everything else here is something they can retry.
   */
  "not-configured": {
    tone: "warn",
    text: "Card payments are not switched on at our end yet. This one is on Second Pair, not on you.",
  },
  /*
   * The connection came back to a different browser from the one that started
   * it — usually an authorise link that has been passed on to somebody else.
   */
  "wrong-browser": {
    tone: "warn",
    text: "That connection was started somewhere else, so nothing was changed. Press connect on this device and follow it through here.",
  },
  "not-in-the-diary": {
    tone: "warn",
    text: "Your sign-in is not linked to one of the team, so there are no takings of your own for an account to receive.",
  },
};

export function StripeNotice({ outcome, detail }: { outcome?: string; detail?: string }) {
  const said = outcome ? OUTCOMES[outcome] : null;
  if (!said) return null;

  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        said.tone === "ok" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"
      }`}
    >
      {said.text}
      {/*
       * What Stripe actually said, where it said anything. "Would not finish"
       * on its own sent everybody back to press the same button again; the
       * reason is usually one line that says exactly what to change.
       */}
      {detail && outcome !== "connected" && (
        <span className="mt-1 block text-xs opacity-80">Stripe said: {detail}</span>
      )}
      {/* The one refusal that is never the business's to fix, said so. */}
      {detail && /does not belong to you|no such application/i.test(detail) && (
        <span className="mt-1 block text-xs">
          That is a setup mismatch at Second Pair&rsquo;s end, not anything you did.
        </span>
      )}
    </p>
  );
}
