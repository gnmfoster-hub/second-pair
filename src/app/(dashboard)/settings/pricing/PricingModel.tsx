"use client";

import { useActionState } from "react";
import { setPricingModel, type ServiceState } from "./serviceActions";

/**
 * Which way this business describes what it sells.
 *
 * Quiet, at the bottom, because it is a decision made once and then never
 * again — a salon does not wake up pricing by the hour. Loud enough to find,
 * because a business set up from the wrong trade pack lands on the wrong one
 * and has no idea why the screen is asking about sizes.
 *
 * Switching moves nothing. Both lists stay exactly where they are, so somebody
 * can look at the other and come back without having lost a price list, which
 * is the only thing that makes a switch like this safe to press.
 */
export function PricingModel({
  current,
  bandCount,
}: {
  current: "bands" | "services";
  bandCount: number;
}) {
  const [state, action] = useActionState<ServiceState, FormData>(setPricingModel, {});
  const other = current === "services" ? "bands" : "services";

  return (
    <form action={action} className="card p-5">
      <input type="hidden" name="pricing_model" value={other} />

      <h2 className="section-title">How you price</h2>

      {current === "services" ? (
        <p className="hint mt-1 max-w-prose">
          A named thing at a set price, which is how most trades work. Some price by the
          hour instead &mdash; a tattooist charges by the size of the piece and how long it
          sits, not by the item.
          {bandCount > 0 && ` Your ${bandCount} old size bands are still here, untouched.`}
        </p>
      ) : (
        <p className="hint mt-1 max-w-prose">
          By the size of the job and the hours it takes, against each person&rsquo;s hourly
          rate. If you sell named things at set prices &mdash; a cut, a clean, a service
          &mdash; the other way will fit you better.
        </p>
      )}

      {state.error && <p className="mt-2 text-sm text-warn">{state.error}</p>}

      <button className="btn-ghost mt-3">
        {current === "services" ? "Price by size and hours instead" : "Price by named services instead"}
      </button>

      <p className="hint mt-2">Nothing is deleted either way, so you can look and come back.</p>
    </form>
  );
}
