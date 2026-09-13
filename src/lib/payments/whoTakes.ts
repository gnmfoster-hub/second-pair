/**
 * Who may take money, and whose account it lands in.
 *
 * A salon with employees and a salon of chair renters are different businesses
 * wearing the same trade. The first wants one Stripe account and the owner
 * settling up however they already do; the second wants a Stripe account each,
 * because the money was never the shop's.
 *
 * Both switches have to agree. The business says whether this kind of money can
 * be taken at all and the person says whether they take it — so an owner can
 * turn the whole thing off in one place without untangling five people, and a
 * stylist who does not want card payments is not made to have them.
 *
 * Pure, and separate from anything that talks to Stripe, because "may this
 * person charge this card" is the question most worth being able to test
 * without a network.
 */

export type MoneyKind = "deposit" | "payment";

export type BusinessMoney = {
  payment_model?: "business" | "people" | null;
  takes_payments?: boolean | null;
  deposit_mode?: string | null;
  stripe_account_id?: string | null;
};

export type PersonMoney = {
  id: string;
  takes_deposits?: boolean | null;
  takes_payments?: boolean | null;
  stripe_account_id?: string | null;
};

export type Verdict =
  | { ok: true; account: string; whose: "business" | "person" }
  | { ok: false; because: string };

/**
 * Whether this person can take this kind of money, and where it goes.
 *
 * Every refusal names what is missing rather than saying no, because each one
 * is fixable by somebody and the fix is different: a switch, a connect flow, or
 * a conversation with the owner.
 */
export function whoTakes(
  business: BusinessMoney,
  person: PersonMoney | null,
  kind: MoneyKind,
): Verdict {
  const model = business.payment_model ?? "business";

  // ───────────────────────────────────────────── is this allowed at all
  if (kind === "payment" && business.takes_payments !== true) {
    return { ok: false, because: "This business does not take payments in full yet." };
  }

  if (kind === "deposit" && (business.deposit_mode ?? "none") === "none") {
    return { ok: false, because: "This business does not take deposits." };
  }

  if (person) {
    const allowed = kind === "deposit" ? person.takes_deposits : person.takes_payments;
    // Undefined means the column is not there yet, which reads as allowed —
    // the business-level switch above is doing the gating in that case.
    if (allowed === false) {
      return {
        ok: false,
        because:
          kind === "deposit"
            ? "This person does not take deposits."
            : "This person does not take payments.",
      };
    }
  }

  // ──────────────────────────────────────────────── and where does it go
  if (model === "people") {
    if (!person) {
      return {
        ok: false,
        because: "Money goes to each person here, so it cannot be taken without knowing who for.",
      };
    }
    if (!person.stripe_account_id) {
      return {
        ok: false,
        because: "They have not connected their own Stripe account yet, so there is nowhere to pay them.",
      };
    }
    return { ok: true, account: person.stripe_account_id, whose: "person" };
  }

  if (!business.stripe_account_id) {
    return {
      ok: false,
      because: "This business has not connected Stripe yet, so there is nowhere for the money to go.",
    };
  }

  return { ok: true, account: business.stripe_account_id, whose: "business" };
}

/**
 * What a payment is worth to whoever did the work, after Stripe.
 *
 * Stored rather than worked out on the way to a screen, because the fee is
 * Stripe's arithmetic and an accountant will check it against their statement
 * rather than against ours. This is only for the rare row where the fee never
 * arrived — a payment still being settled, or one taken before this recorded
 * fees at all.
 */
export function netOf(gross: number, fee: number | null | undefined): number | null {
  if (fee == null) return null;
  return gross - fee;
}
