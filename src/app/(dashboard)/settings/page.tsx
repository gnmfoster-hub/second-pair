import { requireOwner } from "@/lib/studio";
import { canConnectStripe } from "@/lib/env";
import { StudioForm } from "./StudioForm";
import { EveryEnquiry } from "./EveryEnquiry";
import { PaymentModel } from "./PaymentModel";
import { verticalPack } from "@/lib/verticals";

export default async function StudioSettingsPage({
  searchParams,
}: {
  /** How it went, when they have just come back from Stripe. */
  searchParams: Promise<{ stripe?: string }>;
}) {
  // The business itself — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
  const { stripe } = await searchParams;
  return (
    <div className="space-y-3">
      {/* What the business is told about. Theirs, so it lives here. */}
      <EveryEnquiry on={studio.notify_every_enquiry ?? false} />

      {/* Whose money it is, and who may take it. */}
      <PaymentModel
        model={studio.payment_model === "people" ? "people" : "business"}
        takesPayments={studio.takes_payments === true}
        fallback={studio.payment_fallback === true}
        connected={Boolean(studio.stripe_account_id)}
        words={{
          practitioners: {
            ...verticalPack(studio.vertical).vocabulary,
            ...(studio.vocabulary ?? {}),
          }.practitioners,
        }}
      />

      <StudioForm
        studio={studio}
        stripeOutcome={stripe}
        /*
         * Whether there is anything behind the connect button at all.
         *
         * Read here because the environment is the server's — a client
         * component cannot see it, which is why the button has always been
         * offered whether or not it could possibly work.
         */
        canConnectStripe={canConnectStripe()}
        /*
         * Formatted here, in the business's own zone, because a date turned
         * into words in the browser is a date the server rendered differently
         * — which React reports as a hydration error and the reader sees as
         * the page flickering.
         */
        lastSaved={
          studio.updated_at
            ? new Intl.DateTimeFormat("en-GB", {
                timeZone: studio.timezone,
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(studio.updated_at))
            : null
        }
      />
    </div>
  );
}
