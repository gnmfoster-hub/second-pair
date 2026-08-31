import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";

/**
 * Can this assistant actually do its job yet?
 *
 * The setup checklist was a list of chores. This asks a different question:
 * for each thing the assistant is supposed to do, can it do it, and if not,
 * what exactly does it say instead?
 *
 * That last part is the useful bit. "Add your services" is a task; "it cannot
 * quote anything, so it hands every pricing question to you" is a consequence,
 * and consequences get acted on.
 *
 * Ordered by what breaks first. Somebody who fixes only the top item has
 * fixed the thing their next customer would have hit.
 */

export type Capability = {
  key: string;
  /** What it can do, phrased as the thing itself. */
  can: string;
  ready: boolean;
  /** What happens instead, when it is not ready. Only shown when it matters. */
  otherwise: string;
  /** Where to go and fix it. */
  href: string;
  action: string;
  /**
   * Whether the assistant is unusable without this, as opposed to merely
   * worse. Blocking items are the ones worth interrupting somebody about.
   */
  blocking: boolean;
};

export async function readinessOf(
  db: SupabaseClient,
  studio: Studio,
): Promise<Capability[]> {
  const [{ count: people }, { count: services }, { count: faqs }, { count: hours }] =
    await Promise.all([
      db
        .from("artists")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id)
        .eq("active", true),
      db
        .from("price_bands")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id),
      db
        .from("faqs")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id)
        .neq("answer", ""),
      Promise.resolve({ count: studio.hours.filter((h) => !h.closed).length }),
    ]);

  const takesDeposits = studio.deposit_mode !== "none";

  return [
    {
      key: "quote",
      can: "Give people a price",
      ready: (people ?? 0) > 0 && (services ?? 0) > 0,
      otherwise:
        (people ?? 0) === 0
          ? "Nobody has rates set, so every pricing question comes to you."
          : "No services are set up, so it cannot put a number on anything.",
      href: (people ?? 0) === 0 ? "/settings/artists" : "/settings/pricing",
      action: (people ?? 0) === 0 ? "Add rates" : "Add services",
      blocking: true,
    },
    {
      key: "hours",
      can: "Offer times that suit you",
      ready: (hours ?? 0) > 0,
      otherwise: "With no opening hours it will not offer a single appointment.",
      href: "/settings",
      action: "Set your hours",
      blocking: true,
    },
    {
      key: "privacy",
      can: "Tell people how their details are used",
      ready: Boolean(studio.privacy_notice_url),
      otherwise:
        "It still says their details are only used to book them in, but cannot link anywhere.",
      href: "/settings",
      action: "Add the link",
      blocking: false,
    },
    {
      key: "policy",
      can: "Answer questions about cancelling",
      ready: !takesDeposits || studio.cancellation_policy.trim().length > 0,
      otherwise:
        "You take deposits but have not said what happens if somebody cancels, so it has to fetch you.",
      href: "/settings",
      action: "Write the policy",
      blocking: false,
    },
    {
      key: "faqs",
      can: "Answer your usual questions",
      ready: (faqs ?? 0) >= 3,
      otherwise:
        (faqs ?? 0) === 0
          ? "Anything you have not answered, it hands to you — which is most things."
          : `Only ${faqs} answered so far. Everything else comes to you.`,
      href: "/settings/faqs",
      action: "Answer a few",
      blocking: false,
    },
  ];
}
