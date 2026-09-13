import { requireOwner } from "@/lib/studio";
import { StudioForm } from "./StudioForm";
import { EveryEnquiry } from "./EveryEnquiry";
import { PaymentModel } from "./PaymentModel";
import { verticalPack } from "@/lib/verticals";

export default async function StudioSettingsPage() {
  // The business itself — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
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
