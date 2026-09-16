import { requireOwner, getArtists } from "@/lib/studio";
import { canConnectStripe } from "@/lib/env";
import { PaymentModel } from "../PaymentModel";
import { SameStripe } from "../SameStripe";
import { wordsFor } from "@/lib/words";

export const metadata = { title: "Getting paid" };

/**
 * Getting paid, on its own page.
 *
 * It used to sit halfway down the business's settings, under the name and the
 * opening hours and above the VAT question — so the one decision on here that
 * moves real money was found by scrolling past two that do not. Worse, it is
 * the decision most likely to be revisited: a business takes no deposits for
 * six months and then starts, and that is a thing to go and find, not a thing
 * to come across.
 */
export default async function MoneySettingsPage() {
  const { studio, userId } = await requireOwner();
  const team = await getArtists(studio.id);
  const me = team.find((a) => a.user_id === userId) ?? null;
  const words = wordsFor(studio);

  return (
    <div className="space-y-3">
      <PaymentModel
        model={studio.payment_model === "people" ? "people" : "business"}
        takesPayments={studio.takes_payments === true}
        fallback={studio.payment_fallback === true}
        connected={Boolean(studio.stripe_account_id)}
        team={team
          .filter((a) => a.active)
          .map((a) => ({
            id: a.id,
            name: a.name,
            connected: Boolean(a.stripe_account_id),
            isMe: a.user_id === userId,
            canSignIn: Boolean(a.user_id),
          }))}
        canConnect={canConnectStripe(studio)}
        words={{ practitioners: words.practitioners, business: words.business }}
      />

      {/*
       * One Stripe account, where the owner is also one of the people working.
       *
       * Its own panel rather than part of the one above: that is a form, and a
       * form inside a form is not a thing a browser will render. Nothing shows
       * at all until the owner has connected an account of their own.
       */}
      <SameStripe
        mine={(me?.stripe_account_id as string | null) ?? null}
        business={studio.stripe_account_id}
        firstName={me?.name.split(" ")[0] ?? ""}
      />
    </div>
  );
}
