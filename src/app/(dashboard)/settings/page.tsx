import { requireOwner } from "@/lib/studio";
import { canConnectStripe } from "@/lib/env";
import { isPlatformAdmin } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { SeeItAs } from "./SeeItAs";
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

  /*
   * The other ways to look at this business, on a demo and nowhere else.
   *
   * The back office can already open one of these, and going there in the
   * middle of showing somebody the product means putting every other business
   * on the platform on the screen. So it is here too, on the demo's own
   * settings — and gated twice, because the thing behind it hands over a
   * signed-in session.
   */
  const showViews = studio.kind === "demo" && (await isPlatformAdmin());

  let views: { userId: string; label: string; what: string }[] = [];

  if (showViews) {
    const supabase = await createClient();
    const [{ data: everyone }, { data: linked }] = await Promise.all([
      supabase.from("studio_members").select("user_id, role").eq("studio_id", studio.id),
      supabase.from("artists").select("user_id, name, owner_managed").eq("studio_id", studio.id),
    ]);

    const asArtist = new Map(
      (linked ?? []).filter((a) => a.user_id).map((a) => [a.user_id as string, a]),
    );

    views = (everyone ?? []).map((m) => {
      const person = asArtist.get(m.user_id);
      return {
        userId: m.user_id as string,
        label: person
          ? (person.name as string)
          : m.role === "owner"
            ? "The owner"
            : "On the desk",
        what:
          m.role === "owner"
            ? "everything"
            : person
              ? person.owner_managed
                ? "employed — the business keeps her settings"
                : "renting a chair — her own prices, list and reminders"
              : "no column in the diary: the inbox and everybody's day",
      };
    });

    views.sort((a, b) => (a.label === "The owner" ? -1 : b.label === "The owner" ? 1 : 0));
  }

  return (
    <div className="space-y-3">
      {showViews && <SeeItAs studioId={studio.id} views={views} />}

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
        canConnectStripe={canConnectStripe(studio)}
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
