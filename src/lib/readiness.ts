import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { emailReallyWorks } from "@/lib/messaging/email";
import { canTakeCharges } from "@/lib/payments/connect";
import { canConnectStripe } from "@/lib/env";
import { depositReadiness } from "@/lib/depositReadiness";

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
  /*
   * Whether anything can leave the building.
   *
   * Email is ours to configure, so it is the same answer for every business.
   * A text number is theirs, and either one is enough — a business whose
   * customers all arrive by text does not need email.
   */
  /*
   * Whether email will actually send, asked of Resend and remembered for ten
   * minutes — not "are two variables set", which is what this was and which
   * says yes on the evening every send is being refused.
   */
  const canSendEmail = await emailReallyWorks();
  const { count: numbers } = await db
    .from("channel_connections")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studio.id)
    .eq("channel", "sms");
  const hasTextNumber = (numbers ?? 0) > 0;

  const [
    { data: roster },
    { data: priceList },
    { count: faqs },
    { count: hours },
    { count: devices },
  ] = await Promise.all([
      /*
       * Everybody, not just the active ones: a business with somebody on the
       * books who has stopped taking bookings needs telling something different
       * from one that has nobody at all.
       *
       * The whole row rather than one column, because the money questions
       * below need three more of them and PostgREST rejects an entire query
       * over a single column it has not heard of — which on a business part
       * way through a migration would read as having no staff at all.
       */
      db.from("artists").select("*").eq("studio_id", studio.id),
      /*
       * Whichever way this business prices.
       *
       * Counting bands regardless would tell a salon on the named price list
       * that it has nothing to quote from while its list sits full — the same
       * mistake the set-up audit was making, on the same table, for the same
       * reason.
       */
      studio.pricing_model === "services"
        ? db
            .from("services")
            .select("*")
            .eq("studio_id", studio.id)
            .eq("active", true)
        : db.from("price_bands").select("*").eq("studio_id", studio.id),
      db
        .from("faqs")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id)
        .neq("answer", ""),
      Promise.resolve({ count: studio.hours.filter((h) => !h.closed).length }),
      /*
       * Devices that have asked to be buzzed.
       *
       * Checked on the live database and the answer was none, for anybody —
       * which meant every notification this product had ever sent, escalations
       * included, went precisely nowhere and nothing said so.
       */
      db
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id),
    ]);

  const people = (roster ?? []).filter((a) => a.active).length;
  const nobodyAtAll = (roster ?? []).length === 0;

  /*
   * What the assistant could offer a stranger, in one shape.
   *
   * A service belonging to one person is left out: the question is whether
   * this business can quote anybody who walks up, and a nail technician's own
   * list cannot answer that.
   */
  const byList = studio.pricing_model === "services";
  const offerable = (priceList ?? []).filter((row) => {
    const r = row as Record<string, unknown>;
    if (!byList) return true;
    return r.kind === "service" && r.artist_id == null && r.bookable_online !== false;
  });
  const services = offerable.length;

  // Something with no price is never offered at all, because the alternative
  // is the assistant inventing a number.
  const unpriced = byList
    ? offerable.filter((r) => (r as Record<string, unknown>).price_pence == null)
    : [];

  /*
   * Whether anything here can actually produce a number.
   *
   * Counting that price bands exist is not the same as being able to quote
   * from them, and this counted only their existence. A business priced by
   * size has every band sitting at no price and nobody with an hourly rate
   * until somebody fills them in — so it was told "What you charge: Done"
   * while the assistant could not put a figure on a single job, and the owner
   * had no reason to look. The nearest thing to a symptom was a customer being
   * told the price would be confirmed, for ever.
   *
   * A band is priceable if it carries its own price, or if somebody has an
   * hourly rate for its hours to be multiplied by. Either is enough; neither
   * is a business that can quote.
   */
  const someoneHasARate = (roster ?? []).some(
    (a) => Number((a as Record<string, unknown>).hourly_rate_pence ?? 0) > 0,
  );
  const someBandHasAPrice = offerable.some(
    (r) => Number((r as Record<string, unknown>).price_low_pence ?? 0) > 0,
  );
  const canQuote = byList
    ? offerable.length > unpriced.length
    : someBandHasAPrice || someoneHasARate;

  // Work that has to be looked at first is booked for consultation_minutes,
  // whatever the job is. Right when somebody chose that, and absurd when it is
  // still sitting at a default nobody read.
  const needsLookingAt = (priceList ?? []).filter(
    (r) => (r as Record<string, unknown>).requires_consultation === true,
  );

  const takesDeposits = studio.deposit_mode !== "none";

  /*
   * Whether a deposit could actually be paid today.
   *
   * This used to be "has the business connected Stripe", which is the wrong
   * question on a salon of chair renters: there the shop's account is not
   * where anybody's money goes, and a business with it connected read as
   * ready while every charge was refused. Worked out in its own file, where
   * the branches can be tested without a database.
   */
  const perPerson = studio.payment_model === "people";

  const deposits = depositReadiness({
    takesDeposits,
    model: perPerson ? "people" : "business",
    /*
     * Not "is there an account id", but "will Stripe take a charge on it".
     *
     * A Standard account comes back from OAuth before its owner has finished
     * onboarding, so the id is there and every charge is refused — and the
     * owner is told deposits are ready while each one fails. See canTakeCharges.
     */
    businessAccount: await canTakeCharges(studio.stripe_account_id),
    fallback: studio.payment_fallback === true,
    platformReady: canConnectStripe(studio),
    /*
     * Only the people who are actually taking bookings and actually taking
     * deposits. Somebody on the books who has stopped, or who has switched
     * deposits off for themselves, is not a thing anybody needs to fix.
     *
     * takes_deposits undefined means the column is not there yet, which reads
     * as taking them — the same way whoTakes treats it, because the business
     * switch is doing the gating in that case.
     */
    taking: (roster ?? []).filter(
      (a) => a.active && (a as Record<string, unknown>).takes_deposits !== false,
    ).length,
    waiting: (roster ?? [])
      .filter(
        (a) =>
          a.active &&
          (a as Record<string, unknown>).takes_deposits !== false &&
          !(a as Record<string, unknown>).stripe_account_id,
      )
      .map((a) => String((a as Record<string, unknown>).name ?? "").split(" ")[0])
      .filter(Boolean),
  });

  /*
   * The ones this business has said are fine as they are.
   *
   * Advice only. Anything blocking keeps its row whatever is in here, which is
   * enforced below rather than trusted to the caller: a business must not be
   * able to hide the fact that nobody can book.
   *
   * Absent until the migration runs, which reads as nothing dismissed — the
   * same behaviour as before it existed.
   */
  const dismissed = new Set(
    ((studio as unknown as { readiness_dismissed?: string[] | null }).readiness_dismissed ?? []),
  );

  const all: Capability[] = [
    {
      key: "quote",
      can: "Give people a price",
      ready: people > 0 && (services ?? 0) > 0 && canQuote,
      otherwise:
        people > 0
          ? (services ?? 0) === 0
            ? "No services are set up, so it cannot put a number on anything."
            : "Nothing has a price on it and nobody has an hourly rate, so every price " +
              "comes back to you. The assistant will take the enquiry and say you will confirm."
          : nobodyAtAll
            ? "Nobody has rates set, so every pricing question comes to you."
            : "Nobody is taking bookings, so it cannot quote or book anybody in.",
      href: people === 0 ? "/settings/artists" : "/settings/pricing",
      action:
        people === 0
          ? nobodyAtAll
            ? "Add rates"
            : "Take bookings again"
          : (services ?? 0) === 0
            ? "Add services"
            : "Put prices on",
      blocking: true,
    },
    {
      /*
       * The one that was live on a real business and visible only from a
       * terminal. Living Canvas had the script on their site and the widget
       * switched off, so there was no button at all, nothing said so, and every
       * visitor was a lost enquiry.
       *
       * It reads as ready when nobody has switched it off, which is the default
       * — this is here to catch it being turned off and forgotten, not to
       * nag a business that has not installed a website button yet.
       */
      key: "widget",
      can: "Answer on your website",
      ready: studio.widget_enabled !== false,
      otherwise:
        "The button is switched off, so there is none on your site even if the " +
        "code is there, and nothing anywhere says so.",
      href: "/settings/install",
      action: "Turn it on",
      blocking: false,
    },
    {
      /*
       * Work that has to be seen first is set aside consultation_minutes,
       * whatever the job is. Ten minutes is a phone call; looking at an
       * end-of-tenancy clean is an hour, and the difference is a wasted trip.
       */
      key: "consultation",
      can: "Set aside long enough to look at a job",
      ready: !(needsLookingAt.length > 0 && studio.consultation_minutes <= 15),
      otherwise:
        `${needsLookingAt.length} of the things you do need looking at first, and a ` +
        `consultation here is ${studio.consultation_minutes} minutes. That is long ` +
        `enough for a phone call, not for going to see it. Twenty minutes or more ` +
        `clears this; if ${studio.consultation_minutes} is genuinely right for you, ` +
        `say so and it will stop asking.`,
      href: "/settings",
      /*
       * The number that clears it, in the words.
       *
       * "Make it longer" gave no target, so somebody moving it from ten to
       * fifteen did as they were asked and watched the warning stay — which is
       * exactly what Giles reported. A threshold nobody can see is a threshold
       * that looks like a bug.
       */
      action: "Set it to 20 or more",
      blocking: false,
    },
    {
      /*
       * Anything unpriced is silently left out of what can be offered, so a
       * half-filled list quietly shrinks the business rather than erroring.
       */
      key: "priced",
      can: "Quote everything on your list",
      ready: unpriced.length === 0,
      otherwise:
        `${unpriced.length} ${unpriced.length === 1 ? "thing has" : "things have"} no ` +
        `price, so ${unpriced.length === 1 ? "it is" : "they are"} never offered at ` +
        `all, because the alternative would be inventing a number.`,
      href: "/settings/pricing",
      action: "Fill them in",
      blocking: false,
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
      /*
       * Whether anything the assistant does can reach the customer afterwards.
       *
       * The assistant can answer, quote and book perfectly well without any of
       * this — and then the confirmation fails, the reminder fails, and the
       * owner's reply fails, all silently as far as the customer is concerned.
       * Somebody books an appointment on a Tuesday evening and never hears
       * another word, which is worse than not having been answered at all.
       *
       * Not blocking: a business whose customers all arrive by text is fine
       * without email, and telling them they are broken would be wrong. It
       * needs saying, not enforcing.
       */
      key: "reachable",
      can: "Reach them after they book",
      ready: canSendEmail || hasTextNumber,
      otherwise:
        "It can answer and book, but the confirmation, the reminder and your own " +
        "replies have no way of reaching anybody.",
      href: "/settings/install",
      action: "Connect a way to reply",
      blocking: false,
    },
    {
      /*
       * Whether they find out that somebody booked.
       *
       * The assistant putting a stranger in the diary is the whole product
       * working, and it is also the moment the business is least likely to be
       * looking at a screen. Without an address or a device, an appointment
       * can be made on a Tuesday evening and sit there unseen until somebody
       * happens to open the diary — which is exactly the watching they are
       * paying to stop doing.
       *
       * Either one is enough. An email is the one that keeps, a phone is the
       * one that is quick, and most people want both.
       */
      key: "alerts",
      can: "Tell you when somebody books",
      ready: Boolean(studio.email) || (devices ?? 0) > 0,
      otherwise:
        "Nothing will reach you when a booking comes in. You would find out by " +
        "opening the diary and noticing.",
      href: "/settings",
      action: "Add your email",
      blocking: false,
    },
    {
      /*
       * The quick half of being told, which is the half nobody has.
       *
       * Not one device on the whole platform has ever been subscribed. That
       * was invisible until now because the check above accepts an email
       * address instead, and every business has one — so the line reads
       * "ready" while the notification that matters, the one that arrives
       * while somebody is between jobs, has never gone anywhere.
       *
       * Separate and not blocking: email genuinely does tell them. This is
       * the difference between finding out this evening and finding out now.
       *
       * It has to be done on the phone itself, by each person, which is why
       * it points at their own settings rather than the business's — and why
       * it was unreachable until that page existed at all.
       */
      key: "phone",
      can: "Buzz your phone when somebody books",
      ready: (devices ?? 0) > 0,
      otherwise:
        "No phone here has been signed up, so a booking reaches you by email and " +
        "nothing else, which is fine this evening and no use at four o'clock.",
      href: "/settings/you",
      action: "Turn it on",
      blocking: false,
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
      /*
       * Deposits switched on with nowhere for the money to land.
       *
       * Blocking, because without somewhere to pay a deposit cannot be taken
       * at all — the charge is refused rather than quietly routed into the
       * platform's own Stripe, which is what used to happen. This is not a
       * warning about tidiness: it is whether the assistant can hold a slot.
       *
       * Worked out in depositReadiness, because "has the business connected
       * Stripe" is the wrong question on a salon of chair renters and this
       * line asked nothing else for as long as deposits have existed.
       */
      key: "stripe",
      can: "Take a deposit",
      ready: deposits.ready,
      otherwise: deposits.otherwise,
      href: deposits.href,
      /*
       * Sometimes there is no button, and an empty one is better than a wrong
       * one. When the platform key is missing there is nothing an owner can
       * press, and when it is a stylist's own account to connect, sending the
       * owner to a screen that cannot do it would waste the one trip they
       * make.
       */
      action: deposits.action,
      blocking: true,
    },
    {
      /*
       * Somebody being paid into an account that is not theirs.
       *
       * Only ever says anything on the per-person model with the fallback
       * switched on — where deposits are taken perfectly well and land in the
       * shop's account, which is the exact arrangement that model exists to
       * prevent. Nothing is broken, so it is not blocking and there is no
       * button: the fix belongs to the person, and the owner's part was the
       * decision they already made.
       */
      key: "own-accounts",
      can: "Pay each person into their own account",
      ready: !deposits.fallingBack,
      otherwise: deposits.fallingBack ?? "",
      href: "/settings/artists",
      action: "",
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
          ? "Anything you have not answered, it hands to you, which is most things."
          : `Only ${faqs} answered so far. Everything else comes to you.`,
      href: "/settings/faqs",
      action: "Answer a few",
      blocking: false,
    },
  ];

  /*
   * A dismissed check reads as ready, so nothing downstream needs to know
   * this exists — the setup walk-through, the morning email and the admin
   * attention panel all keep working off `ready` alone.
   */
  return all.map((c) =>
    !c.ready && !c.blocking && dismissed.has(c.key) ? { ...c, ready: true } : c,
  );
}
